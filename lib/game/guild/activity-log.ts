import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildAuditLog } from '@/lib/db/schema/guild';
import { characters } from '@/lib/db/schema/server';

/** 길드 홈 활동 피드 1건 — 닉네임 해소 완료(actor/target). detail은 문구 포맷용 원본. */
export type GuildLogEntry = {
  id: string;
  action: string;
  actorNickname: string | null;
  targetNickname: string | null;
  detail: Record<string, unknown> | null;
  createdAtIso: string;
};

/**
 * 길드 활동 로그 — guild_audit_log를 최신순으로 limit건. 행위자/대상 닉네임을 한 번에 해소.
 * 해산(disband)은 길드가 사라져 노출될 일이 없으므로 별도 제외 불필요.
 */
export async function getGuildActivityLog(
  guildId: bigint,
  serverId: number,
  limit = 100,
): Promise<GuildLogEntry[]> {
  const rows = await db
    .select({
      id: guildAuditLog.id,
      action: guildAuditLog.action,
      actorUserId: guildAuditLog.actorUserId,
      targetUserId: guildAuditLog.targetUserId,
      detail: guildAuditLog.detail,
      createdAt: guildAuditLog.createdAt,
    })
    .from(guildAuditLog)
    .where(eq(guildAuditLog.guildId, guildId))
    .orderBy(desc(guildAuditLog.createdAt))
    .limit(limit);

  const ids = [
    ...new Set(rows.flatMap((r) => [r.actorUserId, r.targetUserId]).filter((v): v is string => !!v)),
  ];
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const chars = await db
      .select({ userId: characters.userId, nickname: characters.nickname })
      .from(characters)
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids)));
    for (const c of chars) nameMap.set(c.userId, c.nickname);
  }

  return rows.map((r) => ({
    id: r.id.toString(),
    action: r.action,
    actorNickname: r.actorUserId ? (nameMap.get(r.actorUserId) ?? null) : null,
    targetNickname: r.targetUserId ? (nameMap.get(r.targetUserId) ?? null) : null,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    createdAtIso: r.createdAt.toISOString(),
  }));
}
