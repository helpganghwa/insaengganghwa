import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { chatMessages, chatReports } from '@/lib/db/schema/chat';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { systemMode } from '@/lib/db/schema/ops';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { parseFaceBox } from '@/components/faceCrop';

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
  body: string;
  createdAt: string; // ISO
};

/** 채팅 킬스위치(system_mode key='chat') — 행 없거나 live면 ON. */
export async function isChatEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ mode: systemMode.mode })
    .from(systemMode)
    .where(eq(systemMode.key, 'chat'))
    .limit(1);
  return !row || row.mode === 'live';
}

/** 유저 표시 필드 일괄 해석 — 닉/코드/아바타/길드. */
async function displayFields(
  userIds: string[],
  serverId: number,
): Promise<Map<string, { nickname: string; publicCode: string | null; avatar: string | null; faceBox: { cx: number; cy: number; h: number } | null; guildName: string | null }>> {
  if (userIds.length === 0) return new Map();
  const uniq = [...new Set(userIds)];
  const [rows, guilds] = await Promise.all([
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
    });
  }
  return m;
}

/** 최근 메시지(오래된 → 최신 순, 숨김 제외). */
export async function getRecentChat(serverId: number, limit = 100): Promise<ChatMessageDto[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.serverId, serverId), sql`${chatMessages.hiddenAt} is null`))
    .orderBy(desc(chatMessages.id))
    .limit(limit);
  const fields = await displayFields(rows.map((r) => r.userId), serverId);
  return rows
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
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      };
    });
}

/** 저장 + 브로드캐스트 — 본문은 이미 필터·검증 완료본. 반환 DTO는 낙관 렌더에도 사용. */
export async function persistAndBroadcast(
  userId: string,
  serverId: number,
  body: string,
): Promise<ChatMessageDto> {
  const [row] = await db
    .insert(chatMessages)
    .values({ serverId, userId, body })
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
    body,
    createdAt: row!.createdAt.toISOString(),
  };
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
