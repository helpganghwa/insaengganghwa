import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, zones, guildBattleDeployments } from '@/lib/db/schema/guild';

import { GuildError } from '../errors';
import { nextBattleKstDay, isConquestLocked } from './schedule';

/** actor가 zone 소유 길드의 길드장/부길드장인지 검증하고 소유 길드 id 반환. */
async function assertOfficerOfZoneOwner(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorUserId: string,
  zoneId: number,
): Promise<bigint> {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, actorUserId))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader' && m.role !== 'vice') throw new GuildError('NOT_OFFICER');

  const [z] = await tx
    .select({ ownerGuildId: zones.ownerGuildId })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .for('update');
  if (!z) throw new GuildError('ZONE_NOT_FOUND');
  if (z.ownerGuildId !== m.guildId) throw new GuildError('FORBIDDEN'); // 자기 길드 소유 구역 아님
  return m.guildId;
}

/**
 * 집행관 지정 — GUILD §5.8⑦. 소유 길드 길드장/부길드장이 길드원 1명을 그 구역 집행관으로.
 *  - 대상은 같은 길드원이어야 하고, 이미 다른 구역 집행관이면 거부(1유저 1집행관).
 *  - 집행관은 자동 방어로 슬롯 점유 → 대상의 다음 전투 배치는 제거.
 */
export async function setZoneExecutor(input: {
  actorUserId: string;
  zoneId: number;
  targetUserId: string;
}): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 전투 윈도(23:00~24:00) 잠금
  await db.transaction(async (tx) => {
    const guildId = await assertOfficerOfZoneOwner(tx, input.actorUserId, input.zoneId);

    const [target] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.targetUserId))
      .limit(1);
    if (!target || target.guildId !== guildId) throw new GuildError('TARGET_NOT_IN_GUILD');

    // 1유저 1집행관 — 다른 구역 집행관이면 거부(먼저 해제 필요).
    const [other] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.executorUserId, input.targetUserId), ne(zones.id, input.zoneId)))
      .limit(1);
    if (other) throw new GuildError('TARGET_ALREADY_EXECUTOR');

    await tx.update(zones).set({ executorUserId: input.targetUserId }).where(eq(zones.id, input.zoneId));

    // 집행관은 자동 방어 — 다음 전투의 일반 배치 제거(슬롯 점유 일원화).
    await tx
      .delete(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.userId, input.targetUserId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      );
  });
}

/** 집행관 해제 — 소유 길드 길드장/부길드장. 구역을 집행관 공석으로(자동 방어·수금 중단). */
export async function clearZoneExecutor(input: { actorUserId: string; zoneId: number }): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 전투 윈도 잠금
  await db.transaction(async (tx) => {
    await assertOfficerOfZoneOwner(tx, input.actorUserId, input.zoneId);
    await tx.update(zones).set({ executorUserId: null }).where(eq(zones.id, input.zoneId));
  });
}
