import 'server-only';

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { chatBlocks, chatMessages, chatReports } from '@/lib/db/schema/chat';
import { friendLinks } from '@/lib/db/schema/friends';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { meleeBattles } from '@/lib/db/schema/melee';
import { systemMode } from '@/lib/db/schema/ops';
import { resolveRepTitlesBatch } from '@/lib/game/titles/display';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { parseFaceBox } from '@/components/faceCrop';

import { getWorldFeed, type WorldEventEntry } from '@/lib/game/world/event';
import { getGuildActivityLog, type GuildLogEntry } from '@/lib/game/guild/activity-log';

import { broadcastChat } from './realtime';

/**
 * 월드 채팅 서비스(0125) — 전송·조회·신고. 전송은 Server Action에서 검증(세션·리밋·필터) 후 호출.
 * 표시 필드(닉/아바타/길드)는 저장하지 않고 조회 시 조인 — 닉변·아바타 교체 즉시 반영.
 */

export type ChatMention = { n: string; c: string | null };

/** 발신자 표시 메타 — /api/chat/recent 정규화 응답의 users 값(감사 C). DTO에서 분리. */
export type ChatUserMeta = Pick<
  ChatMessageDto,
  | 'nickname'
  | 'publicCode'
  | 'avatar'
  | 'faceThumb'
  | 'faceBox'
  | 'guildName'
  | 'guildEmblemUrl'
  | 'executorZone'
  | 'executorZoneRegion'
  | 'repTitle'
  | 'isMeleeChampion'
>;

export type ChatMessageDto = {
  id: string;
  userId: string;
  nickname: string;
  publicCode: string | null;
  /** 정면 아바타 URL(작은 썸네일용) — null=기본 아이콘. */
  avatar: string | null;
  /** 서버 사전 생성 얼굴 썸네일(face-thumb.ts) — 있으면 클라 확대 크롭 없이 그대로 표시(선명). */
  faceThumb: string | null;
  /** 얼굴 크롭 박스(검수 산출) — faceThumb 없을 때의 CSS 크롭 폴백. */
  faceBox: { cx: number; cy: number; h: number } | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  /** 집행관 구역명·지역(2026-07-22) — 집행관이 아니면 null. 길드명 우측에 표시. */
  executorZone: string | null;
  executorZoneRegion: string | null;
  /** 표시용 대표 칭호 code(2026-08-05) — 서버에서 활성 재검증 완료본. null=미표시. */
  repTitle: string | null;
  /** 현재(가장 최근) 대난투 우승자 — 닉네임 앞 🏆 표시. */
  isMeleeChampion: boolean;
  /** 유효 멘션(0128) — 닉+공개코드. 표시 시 @ 제거·강조·프로필 링크. (구 string[] 호환) */
  mentions: ChatMention[] | null;
  /** 시스템 라인(월드 이벤트) — 있으면 유저 필드는 빈 값, 렌더는 worldEventMessage. */
  sys?: WorldEventEntry;
  /** 길드 시스템 라인(길드 활동 로그) — 길드 탭 전용, 렌더는 guildLogMessage. */
  sysGuild?: GuildLogEntry;
  body: string;
  createdAt: string; // ISO
  /** 본인 삭제(0177) — true면 body는 CHAT_DELETED_BODY 자리표시. 탭·멘션·신고 비활성. */
  deleted?: boolean;
};

/** 본인 삭제 메시지의 자리표시 본문 — 서버가 치환해 내려보내고(원문은 DB 보존) 클라 낙관 교체에도 쓴다. */
export const CHAT_DELETED_BODY = '삭제된 메시지입니다.';

/** 길드 활동 로그 → 채팅 시스템 라인 DTO. */
export function guildLogToChatDto(entry: GuildLogEntry): ChatMessageDto {
  return {
    id: `gsys-${entry.id}`,
    userId: '',
    nickname: '',
    publicCode: null,
    avatar: null,
    faceThumb: null,
    faceBox: null,
    guildName: null,
    guildEmblemUrl: null,
    executorZone: null,
    executorZoneRegion: null,
    repTitle: null,
    isMeleeChampion: false,
    mentions: null,
    sysGuild: entry,
    body: '',
    createdAt: entry.createdAtIso,
  };
}

/** 저장된 mentions(구=string[], 신={n,c}[]) → ChatMention[] 정규화. */
export function normMentions(v: unknown): ChatMention[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((e) => (typeof e === 'string' ? { n: e, c: null } : (e as ChatMention)));
}

/** 월드 이벤트 → 채팅 시스템 라인 DTO. id는 sys- 프리픽스(실메시지와 충돌 없음). */
export function sysToChatDto(entry: WorldEventEntry): ChatMessageDto {
  return {
    id: `sys-${entry.id}`,
    userId: '',
    nickname: '',
    publicCode: null,
    avatar: null,
    faceThumb: null,
    faceBox: null,
    guildName: null,
    guildEmblemUrl: null,
    executorZone: null,
    executorZoneRegion: null,
    repTitle: null,
    isMeleeChampion: false,
    mentions: null,
    sys: entry,
    body: '',
    createdAt: entry.createdAtIso,
  };
}

/** 가장 최근 대난투 우승자(다음 대난투 확정 전까지 '현재 1등').
 * 하루 1회(9시) 바뀌는 값 — 인스턴스 60초 캐시로 전송·조회마다의 DB 왕복 제거. */
const champCache = new Map<number, { uid: string | null; at: number }>();
const CHAMP_TTL_MS = 60_000;

export async function currentMeleeChampion(serverId: number): Promise<string | null> {
  const cached = champCache.get(serverId);
  if (cached && Date.now() - cached.at < CHAMP_TTL_MS) return cached.uid;
  const [row] = await db
    .select({ uid: meleeBattles.championUserId })
    .from(meleeBattles)
    // status='revealed' 필수(2026-07-22 제보) — run(9:00)이 champion을 먼저 기록하므로
    // 발표(9:30) 전에 새 우승자 트로피가 채팅에 미리 노출되던 버그.
    .where(
      and(
        eq(meleeBattles.serverId, serverId),
        eq(meleeBattles.status, 'revealed'),
        sql`${meleeBattles.championUserId} is not null`,
      ),
    )
    .orderBy(desc(meleeBattles.battleDate))
    .limit(1);
  const uid = row?.uid ?? null;
  champCache.set(serverId, { uid, at: Date.now() });
  return uid;
}

/** 내 길드 채널 정보(0130) — 채팅 길드 탭·전송 검증용. 미가입=null. */
export async function getMyGuildChannel(
  userId: string,
  serverId: number,
): Promise<{ guildId: string; guildName: string } | null> {
  const rows = await db.execute(sql`
    select gm.guild_id::text as gid, g.name
    from guild_members gm join guilds g on g.id = gm.guild_id
    where gm.user_id = ${userId} and gm.server_id = ${serverId} limit 1
  `);
  const r = (rows as unknown as { gid: string; name: string }[])[0];
  return r ? { guildId: r.gid, guildName: r.name } : null;
}

/** 채팅 킬스위치(system_mode key='chat') — 행 없거나 live면 ON.
 * 인스턴스 30초 캐시 — 전송·조회 핫패스에서 DB 왕복 제거(OFF 반영 최대 30초 지연 수용). */
let enabledCache: { v: boolean; at: number } | null = null;
const ENABLED_TTL_MS = 30_000;

/** 킬스위치 캐시 무효화 — 어드민 토글 직후 같은 인스턴스에서 즉시 반영(타 인스턴스는 TTL 30초). */
export function resetChatEnabledCache(): void {
  enabledCache = null;
}

export async function isChatEnabled(): Promise<boolean> {
  if (enabledCache && Date.now() - enabledCache.at < ENABLED_TTL_MS) return enabledCache.v;
  const [row] = await db
    .select({ mode: systemMode.mode })
    .from(systemMode)
    .where(eq(systemMode.key, 'chat'))
    .limit(1);
  const v = !row || row.mode === 'live';
  enabledCache = { v, at: Date.now() };
  return v;
}

/** 유저 표시 필드 일괄 해석 — 닉/코드/아바타/길드. 귓속말(0155)도 같은 해석을 공유. */
export async function displayFields(
  userIds: string[],
  serverId: number,
): Promise<Map<string, { nickname: string; publicCode: string | null; avatar: string | null; faceThumb: string | null; faceBox: { cx: number; cy: number; h: number } | null; guildName: string | null; guildEmblemUrl: string | null; executorZone: string | null; executorZoneRegion: string | null; repTitle: string | null; isMeleeChampion: boolean }>> {
  if (userIds.length === 0) return new Map();
  const uniq = [...new Set(userIds)];
  const [rows, guilds, champion] = await Promise.all([
    db
      .select({
        userId: characters.userId,
        nickname: characters.nickname,
        publicCode: profiles.publicCode,
        repTitleCode: characters.representativeTitleCode, // 서버별(0152)
        rotations: userProfiles.rotations,
        options: userProfiles.options,
      })
      .from(characters)
      .innerJoin(profiles, eq(profiles.id, characters.userId))
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, uniq))),
    getGuildBriefsByUsers(uniq, serverId).catch(() => new Map()),
    currentMeleeChampion(serverId).catch(() => null),
  ]);
  // 대표 칭호 배치 재검증 — 장비/해방형은 배치 2쿼리, heavy 조건부는 60초 캐시 경유(display.ts).
  // 실패해도 채팅은 살린다(전원 미표시 폴백).
  const repMap = await resolveRepTitlesBatch(
    rows.map((r) => ({
      userId: r.userId,
      repCode: r.repTitleCode ?? null,
      executorZone:
        (guilds.get(r.userId) as { executorZone?: string | null } | undefined)?.executorZone ?? null,
    })),
    serverId,
  ).catch(() => new Map<string, string | null>());
  const m = new Map();
  for (const r of rows) {
    const rot = (r.rotations ?? {}) as Record<string, string>;
    const south = rot.south ?? Object.values(rot)[0] ?? null;
    m.set(r.userId, {
      nickname: r.nickname,
      publicCode: r.publicCode,
      avatar: south,
      // 커스텀=생성 시 저장된 face.png, 기본 스프라이트=public의 정적 face.png(스크립트 산출).
      faceThumb:
        rot.face ??
        (south?.startsWith('/sprites/default/') ? south.replace('south.png', 'face.png') : null),
      faceBox: parseFaceBox((r.options as Record<string, unknown> | null)?.faceBox),
      guildName: (guilds.get(r.userId) as { name?: string } | undefined)?.name ?? null,
      guildEmblemUrl: (guilds.get(r.userId) as { emblemUrl?: string | null } | undefined)?.emblemUrl ?? null,
      executorZone: (guilds.get(r.userId) as { executorZone?: string | null } | undefined)?.executorZone ?? null,
      executorZoneRegion:
        (guilds.get(r.userId) as { executorZoneRegion?: string | null } | undefined)?.executorZoneRegion ?? null,
      repTitle: repMap.get(r.userId) ?? null,
      isMeleeChampion: r.userId === champion,
    });
  }
  return m;
}

/**
 * 채널 목록 인스턴스 캐시(2026-08-06, 동접 1천 대비) — 같은 서버·채널의 전체 목록은
 * 유저와 무관하게 동일하므로 폴링(15초)마다 유저 수만큼 반복되던 조회를 인스턴스당
 * TTL 1회로 눌러준다. 전송 시 해당 채널 키를 무효화(같은 인스턴스), 다른 인스턴스는
 * TTL(≤5s)만큼만 늦게 본다 — 폴링 주기(15s)보다 짧아 체감 없음.
 */
const recentCache = new Map<string, { at: number; lim: number; msgs: ChatMessageDto[] }>();
const RECENT_TTL_WORLD_MS = 5_000;
const RECENT_TTL_GUILD_MS = 10_000;
const recentKey = (serverId: number, guildId: bigint | null) =>
  guildId ? `g${serverId}:${guildId}` : `s${serverId}`;

export function invalidateRecentCache(serverId: number, guildId: bigint | null = null): void {
  recentCache.delete(recentKey(serverId, guildId));
}

/** 최근 메시지(오래된 → 최신 순, 숨김 제외). */
export async function getRecentChat(
  serverId: number,
  limit = 100,
  guildId: bigint | null = null,
): Promise<ChatMessageDto[]> {
  // 캐시 히트 — lite(limit=1)도 전체 목록 캐시가 있으면 그 꼬리를 잘라 쓴다(0쿼리).
  const ck = recentKey(serverId, guildId);
  const ttl = guildId ? RECENT_TTL_GUILD_MS : RECENT_TTL_WORLD_MS;
  // lim — 캐시를 채운 요청의 limit. 더 큰 limit 요청에는 히트로 답하지 않는다
  // (50건 선적재 캐시가 100건 요청을 잘라먹는 오염 방지 — 미스로 흘려 새로 채움).
  const hit = recentCache.get(ck);
  if (hit && Date.now() - hit.at < ttl && hit.lim >= limit) {
    return limit >= hit.msgs.length ? hit.msgs : hit.msgs.slice(-limit);
  }
  // 채널 필터 — 전체(guildId null)는 guild_id is null만, 길드는 해당 guild_id만.
  const channelCond = guildId
    ? eq(chatMessages.guildId, guildId)
    : sql`${chatMessages.guildId} is null`;
  const [rows, sysFeed] = await Promise.all([
    db
      .select({
        id: chatMessages.id,
        userId: chatMessages.userId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        createdAt: chatMessages.createdAt,
        deletedAt: chatMessages.deletedAt,
      })
      .from(chatMessages)
      .where(and(eq(chatMessages.serverId, serverId), channelCond, sql`${chatMessages.hiddenAt} is null`))
      .orderBy(desc(chatMessages.id))
      .limit(limit),
    // 시스템 라인 병합 — 전체=월드 피드(30s 캐시), 길드=길드 활동 로그. 실시간은 폴링(15s)이 커버.
    // 깊이 150(2026-07-21): 30건이면 채팅 100건이 걸치는 기간을 못 덮어, 옛 채팅 사이의
    // 피드 줄만 창 밖으로 밀려 사라지는 비대칭 발생(채팅은 남는데 피드만 증발).
    limit > 1
      ? guildId
        ? getGuildActivityLog(guildId, serverId, 150).catch(() => [])
        : getWorldFeed(serverId, 150).catch(() => [])
      : Promise.resolve([]),
  ]);
  const fields = await displayFields(rows.map((r) => r.userId), serverId);
  const msgs = rows
    .reverse()
    .map((r) => {
      const f = fields.get(r.userId);
      return {
        id: String(r.id),
        userId: r.userId,
        nickname: f?.nickname ?? '대장장이',
        publicCode: f?.publicCode ?? null,
        avatar: f?.avatar ?? null,
        faceThumb: f?.faceThumb ?? null,
        faceBox: f?.faceBox ?? null,
        guildName: f?.guildName ?? null,
        guildEmblemUrl: f?.guildEmblemUrl ?? null,
        executorZone: f?.executorZone ?? null,
        executorZoneRegion: f?.executorZoneRegion ?? null,
        repTitle: f?.repTitle ?? null,
        isMeleeChampion: f?.isMeleeChampion ?? false,
        // 삭제분(0177) — 원문·멘션은 내려보내지 않는다(자리표시만).
        mentions: r.deletedAt ? null : normMentions(r.mentions),
        body: r.deletedAt ? CHAT_DELETED_BODY : r.body,
        createdAt: r.createdAt.toISOString(),
        ...(r.deletedAt ? { deleted: true } : {}),
      } satisfies ChatMessageDto;
    });
  if (sysFeed.length === 0) {
    if (limit > 1) recentCache.set(ck, { at: Date.now(), lim: limit, msgs });
    return msgs;
  }
  // 채팅 표시 구간(가장 오래된 메시지 이후) 이벤트만 — 채팅이 없으면 최근 15건.
  const oldest = msgs[0]?.createdAt;
  const toDto = guildId ? guildLogToChatDto : sysToChatDto;
  const sys = (sysFeed as (WorldEventEntry | GuildLogEntry)[])
    .filter((e) => (oldest ? e.createdAtIso >= oldest : true))
    .slice(0, oldest ? undefined : 15)
    // @ts-expect-error 두 피드 타입은 toDto가 guildId로 정확히 대응(런타임 안전).
    .map(toDto);
  const merged = [...msgs, ...sys].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  // 전체 조회만 캐시 — lite(limit=1)는 피드가 빠져 있어 캐시로 쓰면 안 된다.
  if (limit > 1) recentCache.set(ck, { at: Date.now(), lim: limit, msgs: merged });
  return merged;
}

/** 저장 + 브로드캐스트 — 본문은 이미 필터·검증 완료본. 반환 DTO는 낙관 렌더에도 사용. */
export async function persistAndBroadcast(
  userId: string,
  serverId: number,
  body: string,
  mentions: ChatMention[] = [],
  guildId: bigint | null = null,
): Promise<ChatMessageDto> {
  const [row] = await db
    .insert(chatMessages)
    .values({ serverId, userId, body, guildId, mentions: mentions.length ? mentions : null })
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
  const fields = await displayFields([userId], serverId);
  const f = fields.get(userId);
  const dto: ChatMessageDto = {
    id: String(row!.id),
    userId,
    nickname: f?.nickname ?? '대장장이',
    publicCode: f?.publicCode ?? null,
    avatar: f?.avatar ?? null,
    faceThumb: f?.faceThumb ?? null,
    faceBox: f?.faceBox ?? null,
    guildName: f?.guildName ?? null,
    guildEmblemUrl: f?.guildEmblemUrl ?? null,
    executorZone: f?.executorZone ?? null,
    executorZoneRegion: f?.executorZoneRegion ?? null,
    repTitle: f?.repTitle ?? null,
    isMeleeChampion: f?.isMeleeChampion ?? false,
    mentions: mentions.length ? mentions : null,
    body,
    createdAt: row!.createdAt.toISOString(),
  };
  invalidateRecentCache(serverId, guildId); // 같은 인스턴스의 폴링이 곧바로 새 메시지를 보게
  // 미니바 준실시간(2026-08-06) — 월드 채널만, 서버당 15초에 최대 1건을 미니 토픽에 동봉.
  // 스로틀 특성상 한산할 때의 첫 메시지는 즉시 통과(체감 실시간), 폭주 시엔 15초 코얼레싱으로
  // fan-out 비용 상한 고정. 인스턴스별 독립 스로틀이라 최악 인스턴스 수만큼 중복 — 허용.
  const alsoMini = !guildId && Date.now() - (miniLastAt.get(serverId) ?? 0) >= MINI_THROTTLE_MS;
  if (alsoMini) miniLastAt.set(serverId, Date.now());
  // after() 사용 금지(2026-07-21 롤백) — 프로덕션에서 응답 후 콜백이 드롭돼 브로드캐스트가
  // 발사되지 않는 정황(실시간 미전달). 낙관 UI라 전송자 체감 지연 없음 — await로 보장.
  await broadcastChat(serverId, 'new', dto, guildId, { alsoMini });
  return dto;
}

// 미니 토픽 스로틀(서버별) — persistAndBroadcast 참조.
const miniLastAt = new Map<number, number>();
const MINI_THROTTLE_MS = 15_000;

/** 연속 도배(같은 말 즉시 반복) 차단 구간 — 직전 동일 메시지가 이 시간 내일 때만 중복으로 본다. */
const CHAT_DUP_WINDOW_MS = 60_000;

/**
 * 직전 내 메시지와 동일 본문인지 — **단, 최근 CHAT_DUP_WINDOW_MS 이내일 때만** 차단(연속 도배).
 * 시간이 한참 지난 뒤 같은 말('ㅋㅋ' 등)을 다시 치는 건 도배가 아니므로 허용(2026-07-27 문의 반영:
 * 시간 무제한 차단은 과함). rate/burst 제한은 별도(actions.ts)라 이 검사는 '즉시 반복'만 담당.
 */
export async function isDuplicateOfLast(
  userId: string,
  serverId: number,
  body: string,
  guildId: bigint | null = null,
): Promise<boolean> {
  const channelCond = guildId
    ? eq(chatMessages.guildId, guildId)
    : sql`${chatMessages.guildId} is null`;
  const [last] = await db
    .select({ body: chatMessages.body, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.serverId, serverId), eq(chatMessages.userId, userId), channelCond))
    .orderBy(desc(chatMessages.id))
    .limit(1);
  if (!last || last.body !== body) return false;
  return Date.now() - last.createdAt.getTime() < CHAT_DUP_WINDOW_MS;
}

/** 신고 — 중복 무시, 3건 도달 시 자동 숨김 + hide 브로드캐스트. */
export async function reportChatMessage(
  reporterUserId: string,
  messageId: bigint,
  reporterServerId: number,
): Promise<'ok' | 'not_found'> {
  const [msg] = await db
    .select({ id: chatMessages.id, serverId: chatMessages.serverId, guildId: chatMessages.guildId, hiddenAt: chatMessages.hiddenAt, userId: chatMessages.userId })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!msg) return 'not_found';
  // 가시성 검증(2026-07-22) — messageId는 순차라 열거 가능. 신고자는 같은 서버여야 하고,
  // 길드 메시지면 그 길드원이어야 한다(볼 수 없는 메시지의 자동 숨김 어뷰징 차단).
  if (msg.serverId !== reporterServerId) return 'not_found';
  if (msg.guildId) {
    const member = await db.execute(sql`
      select 1 from guild_members
      where user_id = ${reporterUserId} and server_id = ${msg.serverId} and guild_id = ${msg.guildId} limit 1
    `);
    if ((member as unknown as unknown[]).length === 0) return 'not_found';
  }
  await db.insert(chatReports).values({ messageId, reporterUserId }).onConflictDoNothing();
  if (!msg.hiddenAt) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(chatReports)
      .where(eq(chatReports.messageId, messageId));
    if (n >= 3) {
      await db.update(chatMessages).set({ hiddenAt: new Date() }).where(eq(chatMessages.id, messageId));
      invalidateRecentCache(msg.serverId, msg.guildId); // 숨긴 메시지가 캐시에 TTL만큼 남는 것 방지
      await broadcastChat(msg.serverId, 'hide', { id: String(messageId) }, msg.guildId);
    }
  }
  return 'ok';
}

/**
 * 본인 메시지 삭제(0177) — 본문을 자리표시로 바꾸고 행은 남긴다(맥락 보존). 시간 제한 없음.
 *  - 본인·같은 서버만(가시성 검증은 신고와 같은 철학 — 열거로 남의 메시지를 건드릴 수 없게).
 *  - 운영 숨김(hidden_at)된 메시지는 삭제 불가('not_found') — 운영 기록이 우선.
 *  - 멱등: 이미 삭제된 메시지는 'ok'(재브로드캐스트 없음).
 *  - 채널 캐시 무효화 + 'delete' 브로드캐스트(전체는 미니 토픽 동봉 — 닫힌 미니바의 최신 미리보기도 교체).
 */
export async function deleteOwnChatMessage(
  userId: string,
  messageId: bigint,
  serverId: number,
): Promise<'ok' | 'not_found'> {
  const [msg] = await db
    .select({
      serverId: chatMessages.serverId,
      guildId: chatMessages.guildId,
      userId: chatMessages.userId,
      hiddenAt: chatMessages.hiddenAt,
      deletedAt: chatMessages.deletedAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!msg || msg.userId !== userId || msg.serverId !== serverId || msg.hiddenAt) return 'not_found';
  if (msg.deletedAt) return 'ok';
  await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, messageId));
  invalidateRecentCache(msg.serverId, msg.guildId);
  await broadcastChat(msg.serverId, 'delete', { id: String(messageId) }, msg.guildId, {
    alsoMini: !msg.guildId,
  });
  return 'ok';
}

/** 내 차단 목록 — 닉네임은 현재 서버 characters에서 해석(없으면 '유저'). */
export async function getChatBlocks(
  userId: string,
  serverId: number,
): Promise<{ id: string; nickname: string }[]> {
  const rows = await db
    .select({ id: chatBlocks.blockedUserId, nickname: characters.nickname })
    .from(chatBlocks)
    .leftJoin(
      characters,
      and(eq(characters.userId, chatBlocks.blockedUserId), eq(characters.serverId, serverId)),
    )
    .where(eq(chatBlocks.userId, userId))
    .orderBy(desc(chatBlocks.createdAt));
  return rows.map((r) => ({ id: r.id, nickname: r.nickname ?? '유저' }));
}

const CHAT_BLOCK_CAP = 100;

/** 차단 설정/해제 — 멱등. 반환: 적용 후 상태('blocked'|'unblocked'|'CAP'). */
export async function setChatBlock(
  userId: string,
  blockedUserId: string,
  on: boolean,
): Promise<'blocked' | 'unblocked' | 'CAP'> {
  if (!on) {
    await db
      .delete(chatBlocks)
      .where(and(eq(chatBlocks.userId, userId), eq(chatBlocks.blockedUserId, blockedUserId)));
    return 'unblocked';
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatBlocks)
    .where(eq(chatBlocks.userId, userId));
  if (n >= CHAT_BLOCK_CAP) return 'CAP';
  await db.insert(chatBlocks).values({ userId, blockedUserId }).onConflictDoNothing();
  // 두 사람 사이의 친구 관계를 **상태 무관** 양방향 정리 — pending은 유령 행(배지만 켜짐)
  // 방지(2026-08-12), accepted는 차단 시 친구 자동 해제(2026-08-21 사용자 확정). 관계를
  // 남기면 차단해도 레이드 초대 푸시가 오고 접속 시각(lastSeenAt)이 계속 보였다(전수 감사).
  // 차단을 풀어도 친구는 복구되지 않는다 — 다시 친구가 되려면 재신청. 계정 단위라 전 서버 정리.
  await db
    .delete(friendLinks)
    .where(
      or(
        and(eq(friendLinks.requesterId, userId), eq(friendLinks.addresseeId, blockedUserId)),
        and(eq(friendLinks.requesterId, blockedUserId), eq(friendLinks.addresseeId, userId)),
      ),
    );
  return 'blocked';
}

/**
 * 보존 정리(크론) — 7일 초과 또는 채널당 최근 1,000개 초과분 삭제.
 * 배치+시간예산(2026-08-06) — 이전엔 전 테이블 window 정렬 단일 DELETE라 테이블이 크면
 * statement_timeout에 걸리고, 실패가 조용해 다음 날 더 확실히 실패하는 루프였다(채팅 감사).
 * mailbox 정리와 같은 방어를 적용하고 실패는 소리 내어 로그한다.
 */
export async function cleanupChat(): Promise<number> {
  const BATCH = 5000;
  const TIME_BUDGET_MS = 30_000;
  const t0 = Date.now();
  let total = 0;
  try {
    // 1) 채널별 보존 컷오프(1,000번째 최신 id) — id 인덱스만 훑는 소량 결과.
    const cuts = (await db.execute(sql`
      select server_id, coalesce(guild_id, 0) as gid, min(id) as keep_min from (
        select server_id, guild_id, id,
               row_number() over (partition by server_id, coalesce(guild_id, 0) order by id desc) rn
        from chat_messages
      ) t where rn <= 1000 group by 1, 2
    `)) as unknown as { server_id: number; gid: string; keep_min: string }[];

    // 2) 7일 초과분 — 5,000개씩, 예산 안에서.
    while (Date.now() - t0 < TIME_BUDGET_MS) {
      const r = (await db.execute(sql`
        delete from chat_messages where id in (
          select id from chat_messages
          where created_at < now() - interval '7 days'
          limit ${BATCH}
        )
      `)) as unknown as { count?: number };
      const aged = r.count ?? 0;
      total += aged;
      if (aged < BATCH) break;
    }
    for (const c of cuts) {
      if (Date.now() - t0 >= TIME_BUDGET_MS) {
        console.warn(`[chat.cleanup] 시간 예산 소진 — 다음 실행에서 계속 (지금까지 ${total}건)`);
        break;
      }
      // 채널당 초과분 — keep_min 미만을 배치로.
      for (;;) {
        const r = (await db.execute(sql`
          delete from chat_messages where id in (
            select id from chat_messages
            where server_id = ${c.server_id}
              and coalesce(guild_id, 0) = ${BigInt(c.gid)}
              and id < ${BigInt(c.keep_min)}
            limit ${BATCH}
          )
        `)) as unknown as { count?: number };
        const n = r.count ?? 0;
        total += n;
        if (n < BATCH || Date.now() - t0 >= TIME_BUDGET_MS) break;
      }
    }
    return total;
  } catch (e) {
    // 실패를 조용히 삼키지 않는다 — 크론 응답은 정상이어도 로그로 드러나게.
    console.error('[chat.cleanup] 실패', (e as Error).message);
    return -1;
  }
}
