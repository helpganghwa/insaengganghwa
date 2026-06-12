import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { raids, raidRewards } from '@/lib/db/schema/raid';
import { SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';
import { RaidError } from './open';

export type ClaimRaidResult = {
  diamond: number;
  boxes: Record<SupplySlot, number>;
};

/**
 * 레이드 결산 보상 수령 — 상세 화면에서 유저 클릭 시 적립(grow 패턴).
 *  - raid_rewards 행 for update 잠금 → status='settled' & claimed_at IS NULL 검증.
 *  - claimed_at 조건부 stamping(`WHERE claimed_at IS NULL`)으로 동시 수령 레이스 차단.
 *  - 다이아 + 슬롯별 보급 상자 단일 트랜잭션 적립.
 */
export function claimRaidReward(input: {
  userId: string;
  serverId: number;
  raidId: bigint;
}): Promise<ClaimRaidResult> {
  const { userId, raidId } = input;
  return db.transaction(async (tx) => {
    const [reward] = await tx
      .select({
        id: raidRewards.id,
        phaseDiamond: raidRewards.phaseDiamond,
        boxes: raidRewards.boxes,
        claimedAt: raidRewards.claimedAt,
      })
      .from(raidRewards)
      .where(and(eq(raidRewards.raidId, raidId), eq(raidRewards.userId, userId)))
      .for('update');

    if (!reward) throw new RaidError('NOT_PARTICIPANT');
    if (reward.claimedAt) throw new RaidError('REWARD_ALREADY_CLAIMED');

    const [raid] = await tx
      .select({ status: raids.status })
      .from(raids)
      .where(eq(raids.id, raidId));
    if (!raid || raid.status !== 'settled') throw new RaidError('RAID_CLOSED');

    const stamped = await tx
      .update(raidRewards)
      .set({ claimedAt: new Date() })
      .where(and(eq(raidRewards.id, reward.id), isNull(raidRewards.claimedAt)))
      .returning({ id: raidRewards.id });
    if (stamped.length === 0) throw new RaidError('REWARD_ALREADY_CLAIMED');

    const totalDiamond = Number(reward.phaseDiamond);
    if (totalDiamond > 0) {
      await walletAdd(tx, userId, input.serverId, totalDiamond);
    }

    const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
    for (const slot of SUPPLY_SLOTS) {
      const n = reward.boxes[slot] ?? 0;
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
        boxes[slot] = n;
      }
    }

    return { diamond: totalDiamond, boxes };
  });
}
