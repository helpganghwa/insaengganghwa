import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, guildLeaveLog } from '@/lib/db/schema/guild';

import { clearConquestRoleOnExit } from './conquest/on-member-exit';
import { neutralizeAndDeleteGuild } from './disband';
import { GuildError } from './errors';

/**
 * 길드 탈퇴 — GUILD §1. 탈퇴 로그 기록(24h 재가입 잠금용).
 * - 길드장 + 멤버 잔존 → LEADER_MUST_TRANSFER(위임 또는 해산 필요).
 * - 길드장 + 본인만 → 자동 해산(구역 중립화).
 * - 일반 멤버 → 멤버 제거.
 */
export function leaveGuild(input: { userId: string; serverId: number }): Promise<{ disbanded: boolean }> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!m) throw new GuildError('NOT_IN_GUILD');

    if (m.role === 'leader') {
      const [cnt] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, m.guildId));
      if ((cnt?.n ?? 0) > 1) throw new GuildError('LEADER_MUST_TRANSFER');
      await neutralizeAndDeleteGuild(tx, m.guildId); // 마지막 1인(길드장) → 해산
      await tx.insert(guildLeaveLog).values({ userId: input.userId, serverId: input.serverId });
      return { disbanded: true };
    }

    await clearConquestRoleOnExit(tx, input.userId, input.serverId); // 잔류 집행관·미정산 배치 정리
    await tx
      .delete(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)));
    await tx.insert(guildLeaveLog).values({ userId: input.userId, serverId: input.serverId });
    return { disbanded: false };
  });
}
