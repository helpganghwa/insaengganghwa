import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones, guildBattleDeployments } from '@/lib/db/schema/guild';

import { GuildError } from '../errors';
import { logGuildAudit } from '../audit';
import { isConquestLocked, nextBattleKstDay } from './schedule';
import { assertOfficerOfZoneOwner } from './executor';

/**
 * 점령지 포기 — GUILD §5.4. 소유 길드 길드장/부길드장이 보유 구역을 자발적으로 중립화.
 *  - 효과: 소유·집행관·점령시각 해제 + 다음 전투의 우리 길드 배치(수비) 자동 해제. 쌓인 세금(taxPoints/taxDiamond)·수금 타임스탬프는 유지(초기화 안 함) — 구역에 남아 재점령 길드가 승계.
 *  - 점령전 정산·공개 윈도(KST 23:00~01:00)에는 잠금(BATTLE_IN_PROGRESS).
 *  - disband(해산)의 전체 중립화와 달리 "한 구역만" 포기. 활동 피드에 zone_lost(reason:abandon) 기록.
 */
export async function abandonZone(input: { actorUserId: string; zoneId: number }): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS');
  await db.transaction(async (tx) => {
    const { guildId, serverId, zoneName } = await assertOfficerOfZoneOwner(tx, input.actorUserId, input.zoneId);

    await tx
      .update(zones)
      .set({
        ownerGuildId: null,
        executorUserId: null,
        capturedAt: null,
      })
      .where(eq(zones.id, input.zoneId));

    // 다음 전투의 우리 길드 배치 해제 — 소유 구역엔 우리 길드 '수비' 배치만 존재(공격은 자기 구역 불가).
    // 타 길드의 이 구역 '공격' 배치는 중립 대상 공격으로 여전히 유효하므로 건드리지 않음(guildId 스코프).
    await tx
      .delete(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.zoneId, input.zoneId),
          eq(guildBattleDeployments.guildId, guildId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      );

    await logGuildAudit(tx, {
      serverId,
      guildId,
      actorUserId: input.actorUserId,
      action: 'zone_lost',
      detail: { reason: 'abandon', zone: zoneName },
    });
  });
}
