import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';

import { GuildError } from '../errors';
import { logGuildAudit } from '../audit';
import { isConquestLocked } from './schedule';
import { assertOfficerOfZoneOwner } from './executor';

/**
 * 점령지 포기 — GUILD §5.4. 소유 길드 길드장/부길드장이 보유 구역을 자발적으로 중립화.
 *  - 효과: 소유·집행관·점령시각 해제. 쌓인 세금(taxPoints/taxDiamond)·수금 타임스탬프는 유지(초기화 안 함) — 구역에 남아 재점령 길드가 승계.
 *  - 점령전 정산·공개 윈도(KST 23:00~01:00)에는 잠금(BATTLE_IN_PROGRESS).
 *  - disband(해산)의 전체 중립화와 달리 "한 구역만" 포기. 활동 피드에 zone_lost(reason:abandon) 기록.
 */
export async function abandonZone(input: { actorUserId: string; zoneId: number }): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS');
  await db.transaction(async (tx) => {
    const { guildId, serverId } = await assertOfficerOfZoneOwner(tx, input.actorUserId, input.zoneId);

    await tx
      .update(zones)
      .set({
        ownerGuildId: null,
        executorUserId: null,
        capturedAt: null,
      })
      .where(eq(zones.id, input.zoneId));

    await logGuildAudit(tx, {
      serverId,
      guildId,
      actorUserId: input.actorUserId,
      action: 'zone_lost',
      detail: { reason: 'abandon', zoneId: input.zoneId },
    });
  });
}
