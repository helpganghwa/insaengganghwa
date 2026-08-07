import 'server-only';

import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { chatMessages, whisperMessages } from '@/lib/db/schema/chat';
import { guilds } from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';

/**
 * 채팅 검수 조회 — 어드민 전용. 일반 채팅 서비스 경로(lib/game/chat/*)와 의도적으로 분리한다.
 * 서비스 경로는 "유저가 볼 수 있는 것"(숨김 제외·나가기 반영·캐시)을 돌려주지만, 검수는
 * **원본 전부**(숨김 포함, whisper_reads의 나가기/읽음 포인터 무시)를 봐야 하기 때문.
 */

export interface Page<T> {
  rows: T[];
  hasMore: boolean;
}

export interface AdminChatRow {
  id: bigint;
  serverId: number;
  userId: string;
  body: string;
  guildId: bigint | null;
  guildName: string | null;
  hiddenAt: Date | null;
  createdAt: Date;
  nickname: string | null;
  publicCode: string | null;
  mutedUntil: Date | null;
  reports: number;
}

/**
 * 채널(전체 또는 특정 길드) 메시지 — 최신순, 숨김 포함.
 * guildId=null → 전체 채팅(guild_id is null), 값 → 해당 길드 채널.
 * q는 닉네임·본문 부분일치 + 유저코드 정확일치.
 */
export async function listChannelMessages(opts: {
  serverId: number | null;
  guildId: bigint | null;
  q: string;
  offset: number;
  limit: number;
}): Promise<Page<AdminChatRow>> {
  const conds: (SQL | undefined)[] = [
    opts.guildId == null ? isNull(chatMessages.guildId) : eq(chatMessages.guildId, opts.guildId),
  ];
  if (opts.serverId != null) conds.push(eq(chatMessages.serverId, opts.serverId));
  if (opts.q) {
    const code = opts.q.replace(/^#/, '');
    conds.push(
      or(
        ilike(characters.nickname, `%${opts.q}%`),
        ilike(chatMessages.body, `%${opts.q}%`),
        ilike(profiles.publicCode, code),
      ),
    );
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      serverId: chatMessages.serverId,
      userId: chatMessages.userId,
      body: chatMessages.body,
      guildId: chatMessages.guildId,
      guildName: guilds.name,
      hiddenAt: chatMessages.hiddenAt,
      createdAt: chatMessages.createdAt,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      mutedUntil: profiles.chatMutedUntil,
      reports: sql<number>`(select count(*)::int from chat_reports r where r.message_id = ${chatMessages.id})`,
    })
    .from(chatMessages)
    // 닉네임은 해당 서버 캐릭터 기준(계정이 아니라 서버별 이름).
    .leftJoin(
      characters,
      and(eq(characters.userId, chatMessages.userId), eq(characters.serverId, chatMessages.serverId)),
    )
    .leftJoin(profiles, eq(profiles.id, chatMessages.userId))
    .leftJoin(guilds, eq(guilds.id, chatMessages.guildId))
    .where(and(...conds))
    .orderBy(desc(chatMessages.id))
    // limit+1 — 다음 페이지 존재 여부를 count 쿼리 없이 판정.
    .limit(opts.limit + 1)
    .offset(opts.offset);

  return { rows: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
}

export interface AdminGuildChannelRow {
  id: string;
  name: string;
  serverId: number;
  lastAt: Date | null;
  msgCount: number;
  hiddenCount: number;
}

/** 길드 채널 목록 — 이름 검색 + 최근 메시지 시각(메시지 없는 길드도 노출). */
export async function listGuildChannels(
  serverId: number | null,
  q: string,
  limit = 50,
): Promise<AdminGuildChannelRow[]> {
  const rows = (await db.execute(sql`
    select g.id::text as id, g.name, g.server_id,
           max(m.created_at) as last_at,
           count(m.id)::int as msg_count,
           (count(m.id) filter (where m.hidden_at is not null))::int as hidden_count
    from guilds g
    left join chat_messages m on m.guild_id = g.id
    where ${serverId == null ? sql`true` : sql`g.server_id = ${serverId}`}
      and ${q ? sql`g.name ilike ${`%${q}%`}` : sql`true`}
    group by g.id, g.name, g.server_id
    order by max(m.id) desc nulls last, g.name
    limit ${limit}
  `)) as unknown as {
    id: string;
    name: string;
    server_id: number;
    last_at: string | null;
    msg_count: number;
    hidden_count: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    serverId: r.server_id,
    lastAt: r.last_at ? new Date(r.last_at) : null,
    msgCount: r.msg_count,
    hiddenCount: r.hidden_count,
  }));
}

export async function getGuildBrief(
  guildId: bigint,
): Promise<{ id: bigint; name: string; serverId: number } | null> {
  const [g] = await db
    .select({ id: guilds.id, name: guilds.name, serverId: guilds.serverId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  return g ?? null;
}

export interface AdminCharacterRow {
  userId: string;
  serverId: number;
  nickname: string;
  publicCode: string;
  mutedUntil: Date | null;
  bannedAt: Date | null;
}

/** 유저 검색 — 닉네임 부분일치 + 유저코드(#publicCode) 정확일치. 서버별 캐릭터 단위로 반환. */
export async function searchCharacters(
  q: string,
  serverId: number | null,
  limit = 30,
): Promise<AdminCharacterRow[]> {
  const code = q.replace(/^#/, '');
  const conds: (SQL | undefined)[] = [
    or(ilike(characters.nickname, `%${q}%`), ilike(profiles.publicCode, code)),
  ];
  if (serverId != null) conds.push(eq(characters.serverId, serverId));
  return db
    .select({
      userId: characters.userId,
      serverId: characters.serverId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      mutedUntil: profiles.chatMutedUntil,
      bannedAt: profiles.bannedAt,
    })
    .from(characters)
    .innerJoin(profiles, eq(profiles.id, characters.userId))
    .where(and(...conds))
    .orderBy(characters.nickname)
    .limit(limit);
}

export interface AdminUserBrief {
  userId: string;
  publicCode: string;
  mutedUntil: Date | null;
  bannedAt: Date | null;
  /** 서버별 캐릭터 — 닉네임은 서버마다 다르므로 전부 보여준다. */
  characters: { serverId: number; nickname: string }[];
}

/** 검수 대상 유저 머리말 — 계정(코드·제재) + 서버별 닉네임. */
export async function getUserBrief(userId: string): Promise<AdminUserBrief | null> {
  const [account, chars] = await Promise.all([
    db
      .select({
        id: profiles.id,
        publicCode: profiles.publicCode,
        mutedUntil: profiles.chatMutedUntil,
        bannedAt: profiles.bannedAt,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    db
      .select({ serverId: characters.serverId, nickname: characters.nickname })
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(characters.serverId),
  ]);
  const p = account[0];
  if (!p) return null;
  return {
    userId: p.id,
    publicCode: p.publicCode,
    mutedUntil: p.mutedUntil,
    bannedAt: p.bannedAt,
    characters: chars,
  };
}

export interface AdminWhisperPeerRow {
  serverId: number;
  peerId: string;
  nickname: string | null;
  publicCode: string | null;
  lastAt: Date;
  msgCount: number;
  hiddenCount: number;
}

/**
 * 대화 상대 목록 — 대상 유저가 주고받은 전 대화(방향 무관). 서버별로 분리해 집계한다.
 * whisper_reads(읽음/나가기)는 참조하지 않는다 — 유저가 나간 대화도 원본은 남아 있고 검수 대상.
 */
export async function listWhisperPeers(
  userId: string,
  serverId: number | null,
  limit = 50,
): Promise<AdminWhisperPeerRow[]> {
  const agg = (await db.execute(sql`
    select t.server_id, t.peer_id::text as peer_id,
           max(t.created_at) as last_at,
           count(*)::int as msg_count,
           (count(*) filter (where t.hidden_at is not null))::int as hidden_count
    from (
      select server_id, id, created_at, hidden_at,
             case when from_user_id = ${userId}::uuid then to_user_id else from_user_id end as peer_id
      from whisper_messages
      where (from_user_id = ${userId}::uuid or to_user_id = ${userId}::uuid)
        and ${serverId == null ? sql`true` : sql`server_id = ${serverId}`}
    ) t
    group by t.server_id, t.peer_id
    order by max(t.id) desc
    limit ${limit}
  `)) as unknown as {
    server_id: number;
    peer_id: string;
    last_at: string;
    msg_count: number;
    hidden_count: number;
  }[];
  if (agg.length === 0) return [];

  // 상대 신원은 별도 조회 — 집계에 조인을 얹으면 행이 곱해진다.
  const peerIds = [...new Set(agg.map((r) => r.peer_id))];
  const [nicks, codes] = await Promise.all([
    db
      .select({ userId: characters.userId, serverId: characters.serverId, nickname: characters.nickname })
      .from(characters)
      .where(inArray(characters.userId, peerIds)),
    db
      .select({ id: profiles.id, publicCode: profiles.publicCode })
      .from(profiles)
      .where(inArray(profiles.id, peerIds)),
  ]);
  const nickBy = new Map(nicks.map((n) => [`${n.userId}:${n.serverId}`, n.nickname]));
  const codeBy = new Map(codes.map((c) => [c.id, c.publicCode]));

  return agg.map((r) => ({
    serverId: r.server_id,
    peerId: r.peer_id,
    nickname: nickBy.get(`${r.peer_id}:${r.server_id}`) ?? null,
    publicCode: codeBy.get(r.peer_id) ?? null,
    lastAt: new Date(r.last_at),
    msgCount: r.msg_count,
    hiddenCount: r.hidden_count,
  }));
}

export interface AdminWhisperRow {
  id: bigint;
  serverId: number;
  fromUserId: string;
  toUserId: string;
  body: string;
  hiddenAt: Date | null;
  createdAt: Date;
  reports: number;
}

/**
 * 1:1 스레드 원본 — 숨김 포함 전부, 최신순.
 * 쌍 정규화(least/greatest)는 whisper_pair_idx와 같은 식이라 인덱스를 그대로 탄다.
 */
export async function listWhisperThread(opts: {
  serverId: number;
  userId: string;
  peerId: string;
  offset: number;
  limit: number;
}): Promise<Page<AdminWhisperRow>> {
  const rows = await db
    .select({
      id: whisperMessages.id,
      serverId: whisperMessages.serverId,
      fromUserId: whisperMessages.fromUserId,
      toUserId: whisperMessages.toUserId,
      body: whisperMessages.body,
      hiddenAt: whisperMessages.hiddenAt,
      createdAt: whisperMessages.createdAt,
      // 귓속말은 자동 숨김 임계가 없다 — 신고는 이 숫자로만 드러나고 처리는 검수자 판단.
      reports: sql<number>`(select count(*)::int from whisper_reports r where r.message_id = ${whisperMessages.id})`,
    })
    .from(whisperMessages)
    .where(
      and(
        eq(whisperMessages.serverId, opts.serverId),
        sql`least(${whisperMessages.fromUserId}, ${whisperMessages.toUserId}) = least(${opts.userId}::uuid, ${opts.peerId}::uuid)`,
        sql`greatest(${whisperMessages.fromUserId}, ${whisperMessages.toUserId}) = greatest(${opts.userId}::uuid, ${opts.peerId}::uuid)`,
      ),
    )
    .orderBy(desc(whisperMessages.id))
    .limit(opts.limit + 1)
    .offset(opts.offset);
  return { rows: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
}

export interface AdminIdentity {
  nickname: string | null;
  publicCode: string;
  mutedUntil: Date | null;
  bannedAt: Date | null;
}

/** userId → 신원(해당 서버 닉네임 + 계정 코드/제재 상태). 스레드 머리말·발신자 표기용. */
export async function getIdentities(
  userIds: string[],
  serverId: number,
): Promise<Map<string, AdminIdentity>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: profiles.id,
      publicCode: profiles.publicCode,
      mutedUntil: profiles.chatMutedUntil,
      bannedAt: profiles.bannedAt,
      nickname: characters.nickname,
    })
    .from(profiles)
    .leftJoin(characters, and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)))
    .where(inArray(profiles.id, userIds));
  return new Map(
    rows.map((r) => [
      r.userId,
      { nickname: r.nickname, publicCode: r.publicCode, mutedUntil: r.mutedUntil, bannedAt: r.bannedAt },
    ]),
  );
}
