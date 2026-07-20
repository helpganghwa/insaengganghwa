import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { chatBlocks, chatMessages, chatReports } from '@/lib/db/schema/chat';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { meleeBattles } from '@/lib/db/schema/melee';
import { systemMode } from '@/lib/db/schema/ops';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { parseFaceBox } from '@/components/faceCrop';

import { getWorldFeed, type WorldEventEntry } from '@/lib/game/world/event';

import { broadcastChat } from './realtime';

/**
 * 월드 채팅 서비스(0125) — 전송·조회·신고. 전송은 Server Action에서 검증(세션·리밋·필터) 후 호출.
 * 표시 필드(닉/아바타/길드)는 저장하지 않고 조회 시 조인 — 닉변·아바타 교체 즉시 반영.
 */

export type ChatMessageDto = {
  id: string;
  userId: string;
  nickname: string;
  publicCode: string | null;
  /** 정면 아바타 URL(작은 썸네일용) — null=기본 아이콘. */
  avatar: string | null;
  /** 얼굴 크롭 박스(검수 산출) — 헤더/친구 썸네일과 동일 크롭. */
  faceBox: { cx: number; cy: number; h: number } | null;
  guildName: string | null;
  guildEmblemUrl: string | null;
  /** 현재(가장 최근) 대난투 우승자 — 닉네임 앞 🏆 표시. */
  isMeleeChampion: boolean;
  /** 유효 멘션 닉 목록(0128) — 표시 시 @ 제거·색 강조 대상. */
  mentions: string[] | null;
  /** 시스템 라인(월드 이벤트) — 있으면 유저 필드는 빈 값, 렌더는 worldEventMessage. */
  sys?: WorldEventEntry;
  body: string;
  createdAt: string; // ISO
};

/** 월드 이벤트 → 채팅 시스템 라인 DTO. id는 sys- 프리픽스(실메시지와 충돌 없음). */
export function sysToChatDto(entry: WorldEventEntry): ChatMessageDto {
  return {
    id: `sys-${entry.id}`,
    userId: '',
    nickname: '',
    publicCode: null,
    avatar: null,
    faceBox: null,
    guildName: null,
    guildEmblemUrl: null,
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
    .where(and(eq(meleeBattles.serverId, serverId), sql`${meleeBattles.championUserId} is not null`))
    .orderBy(desc(meleeBattles.battleDate))
    .limit(1);
  const uid = row?.uid ?? null;
  champCache.set(serverId, { uid, at: Date.now() });
  return uid;
}

/** 채팅 킬스위치(system_mode key='chat') — 행 없거나 live면 ON.
 * 인스턴스 30초 캐시 — 전송·조회 핫패스에서 DB 왕복 제거(OFF 반영 최대 30초 지연 수용). */
let enabledCache: { v: boolean; at: number } | null = null;
const ENABLED_TTL_MS = 30_000;

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

/** 유저 표시 필드 일괄 해석 — 닉/코드/아바타/길드. */
async function displayFields(
  userIds: string[],
  serverId: number,
): Promise<Map<string, { nickname: string; publicCode: string | null; avatar: string | null; faceBox: { cx: number; cy: number; h: number } | null; guildName: string | null; guildEmblemUrl: string | null; isMeleeChampion: boolean }>> {
  if (userIds.length === 0) return new Map();
  const uniq = [...new Set(userIds)];
  const [rows, guilds, champion] = await Promise.all([
    db
      .select({
        userId: characters.userId,
        nickname: characters.nickname,
        publicCode: profiles.publicCode,
        rotations: userProfiles.rotations,
        options: userProfiles.options,
      })
      .from(characters)
      .innerJoin(profiles, eq(profiles.id, characters.userId))
      .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, uniq))),
    getGuildBriefsByUsers(uniq, serverId).catch(() => new Map<string, { name: string }>()),
    currentMeleeChampion(serverId).catch(() => null),
  ]);
  const m = new Map();
  for (const r of rows) {
    const rot = (r.rotations ?? {}) as Record<string, string>;
    m.set(r.userId, {
      nickname: r.nickname,
      publicCode: r.publicCode,
      avatar: rot.south ?? Object.values(rot)[0] ?? null,
      faceBox: parseFaceBox((r.options as Record<string, unknown> | null)?.faceBox),
      guildName: (guilds.get(r.userId) as { name?: string } | undefined)?.name ?? null,
      guildEmblemUrl: (guilds.get(r.userId) as { emblemUrl?: string | null } | undefined)?.emblemUrl ?? null,
      isMeleeChampion: r.userId === champion,
    });
  }
  return m;
}

/** 최근 메시지(오래된 → 최신 순, 숨김 제외). */
export async function getRecentChat(serverId: number, limit = 100): Promise<ChatMessageDto[]> {
  const [rows, worldFeed] = await Promise.all([
    db
      .select({
        id: chatMessages.id,
        userId: chatMessages.userId,
        body: chatMessages.body,
        mentions: chatMessages.mentions,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(and(eq(chatMessages.serverId, serverId), sql`${chatMessages.hiddenAt} is null`))
      .orderBy(desc(chatMessages.id))
      .limit(limit),
    // 시스템 라인(월드 이벤트) 병합 — 30초 캐시 피드 재사용(실시간은 broadcast 'sys'가 커버).
    limit > 1 ? getWorldFeed(serverId, 30).catch(() => []) : Promise.resolve([]),
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
        faceBox: f?.faceBox ?? null,
        guildName: f?.guildName ?? null,
        guildEmblemUrl: f?.guildEmblemUrl ?? null,
        isMeleeChampion: f?.isMeleeChampion ?? false,
        mentions: (r.mentions as string[] | null) ?? null,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      } satisfies ChatMessageDto;
    });
  if (worldFeed.length === 0) return msgs;
  // 채팅 표시 구간(가장 오래된 메시지 이후) 이벤트만 — 채팅이 없으면 최근 15건.
  const oldest = msgs[0]?.createdAt;
  const sys = worldFeed
    .filter((e) => (oldest ? e.createdAtIso >= oldest : true))
    .slice(0, oldest ? undefined : 15)
    .map(sysToChatDto);
  return [...msgs, ...sys].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** 저장 + 브로드캐스트 — 본문은 이미 필터·검증 완료본. 반환 DTO는 낙관 렌더에도 사용. */
export async function persistAndBroadcast(
  userId: string,
  serverId: number,
  body: string,
  mentions: string[] = [],
): Promise<ChatMessageDto> {
  const [row] = await db
    .insert(chatMessages)
    .values({ serverId, userId, body, mentions: mentions.length ? mentions : null })
    .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });
  const fields = await displayFields([userId], serverId);
  const f = fields.get(userId);
  const dto: ChatMessageDto = {
    id: String(row!.id),
    userId,
    nickname: f?.nickname ?? '대장장이',
    publicCode: f?.publicCode ?? null,
    avatar: f?.avatar ?? null,
    faceBox: f?.faceBox ?? null,
    guildName: f?.guildName ?? null,
    guildEmblemUrl: f?.guildEmblemUrl ?? null,
    isMeleeChampion: f?.isMeleeChampion ?? false,
    mentions: mentions.length ? mentions : null,
    body,
    createdAt: row!.createdAt.toISOString(),
  };
  // after() 사용 금지(2026-07-21 롤백) — 프로덕션에서 응답 후 콜백이 드롭돼 브로드캐스트가
  // 발사되지 않는 정황(실시간 미전달). 낙관 UI라 전송자 체감 지연 없음 — await로 보장.
  await broadcastChat(serverId, 'new', dto);
  return dto;
}

/** 직전 내 메시지와 동일 본문인지(연속 도배 차단). */
export async function isDuplicateOfLast(userId: string, serverId: number, body: string): Promise<boolean> {
  const [last] = await db
    .select({ body: chatMessages.body })
    .from(chatMessages)
    .where(and(eq(chatMessages.serverId, serverId), eq(chatMessages.userId, userId)))
    .orderBy(desc(chatMessages.id))
    .limit(1);
  return last?.body === body;
}

/** 신고 — 중복 무시, 3건 도달 시 자동 숨김 + hide 브로드캐스트. */
export async function reportChatMessage(
  reporterUserId: string,
  messageId: bigint,
): Promise<'ok' | 'not_found'> {
  const [msg] = await db
    .select({ id: chatMessages.id, serverId: chatMessages.serverId, hiddenAt: chatMessages.hiddenAt, userId: chatMessages.userId })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!msg) return 'not_found';
  await db.insert(chatReports).values({ messageId, reporterUserId }).onConflictDoNothing();
  if (!msg.hiddenAt) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(chatReports)
      .where(eq(chatReports.messageId, messageId));
    if (n >= 3) {
      await db.update(chatMessages).set({ hiddenAt: new Date() }).where(eq(chatMessages.id, messageId));
      await broadcastChat(msg.serverId, 'hide', { id: String(messageId) });
    }
  }
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
  return 'blocked';
}

/** 보존 정리(크론) — 7일 초과 또는 서버당 최근 1,000개 초과분 삭제. */
export async function cleanupChat(): Promise<number> {
  const r = await db.execute(sql`
    delete from chat_messages
    where created_at < now() - interval '7 days'
       or id in (
         select id from (
           select id, row_number() over (partition by server_id order by id desc) rn
           from chat_messages
         ) t where t.rn > 1000
       )
  `);
  return (r as unknown as { count?: number }).count ?? 0;
}
