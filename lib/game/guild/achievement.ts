import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, guildAuditLog } from '@/lib/db/schema/guild';

/**
 * 멤버 업적 → 길드 활동 로그(GuildLogFeed). 강화/초월/대난투 정산부에서 best-effort 호출.
 *
 * 길드원일 때만 기록(비-길드원·오류·DB 실패는 조용히 무시 — 정산 결과에 영향 없음). 마일스톤만
 * 호출하므로(강화 100단위·초월 10단위·대난투 1~3위) 빈도 낮음.
 */
export type MemberAchievement =
  | { action: 'achv_enhance'; detail: { item: string; level: number } }
  | { action: 'achv_transcend'; detail: { item: string; level: number } }
  | { action: 'achv_melee'; detail: { rank: number } };

export async function logMemberAchievement(
  userId: string,
  serverId: number,
  a: MemberAchievement,
): Promise<void> {
  try {
    const [m] = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
      .limit(1);
    if (!m) return; // 비-길드원
    await db.insert(guildAuditLog).values({
      serverId,
      guildId: m.guildId,
      actorUserId: userId,
      action: a.action,
      targetUserId: null,
      detail: a.detail,
    });
  } catch {
    // best-effort — 업적 기록 실패는 무시.
  }
}
