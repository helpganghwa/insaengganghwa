import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { raids, raidRewards } from '@/lib/db/schema/raid';
import { SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';
import { RaidError } from './open';

export type ClaimRaidResult = {
  boxes: Record<SupplySlot, number>;
};

/**
 * 레이드 결산 보상 수령 — 상세 화면에서 유저 클릭 시 적립(grow 패턴).
 *  - raid_rewards 행 for update 잠금 → status='settled' & claimed_at IS NULL 검증.
 *  - claimed_at 조건부 stamping(`WHERE claimed_at IS NULL`)으로 동시 수령 레이스 차단.
 *  - 슬롯별 보급 상자만 단일 트랜잭션 적립(레이드 보상=상자 전용, BALANCE §5.4 — 다이아 없음).
 */
export function claimRaidReward(input: {
  userId: string;
  raidId: bigint;
}): Promise<ClaimRaidResult> {
  const { userId, raidId } = input;
  return db.transaction(async (tx) => {
    const [reward] = await tx
      .select({
        id: raidRewards.id,
        boxes: raidRewards.boxes,
        claimedAt: raidRewards.claimedAt,
      })
      .from(raidRewards)
      .where(and(eq(raidRewards.raidId, raidId), eq(raidRewards.userId, userId)))
      .for('update');

    if (!reward) throw new RaidError('NOT_PARTICIPANT');
    if (reward.claimedAt) throw new RaidError('REWARD_ALREADY_CLAIMED');

    const [raid] = await tx
      .select({ status: raids.status, serverId: raids.serverId })
      .from(raids)
      .where(eq(raids.id, raidId));
    if (!raid || raid.status !== 'settled') throw new RaidError('RAID_CLOSED');

    const stamped = await tx
      .update(raidRewards)
      .set({ claimedAt: new Date() })
      .where(and(eq(raidRewards.id, reward.id), isNull(raidRewards.claimedAt)))
      .returning({ id: raidRewards.id });
    if (stamped.length === 0) throw new RaidError('REWARD_ALREADY_CLAIMED');

    // 보급 상자는 참여한 레이드의 서버로 적립(활성 서버 무관 — 공유 링크 교차 참여 대비). 레이드 보상=상자 전용.
    const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
    for (const slot of SUPPLY_SLOTS) {
      const n = reward.boxes[slot] ?? 0;
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, serverId: raid.serverId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
        boxes[slot] = n;
      }
    }

    return { boxes };
  });
}

export type ClaimAllRaidResult = {
  /** 이번에 받은 레이드 id(문자열) — 화면이 낙관적으로 지운 칸과 맞춰 본다. */
  raidIds: string[];
  boxes: Record<SupplySlot, number>;
};

/**
 * 레이드 보상 모두 받기(#545) — 활성 서버의 정산 끝난 미수령 보상을 한 트랜잭션에서 전부 받는다.
 *  - 조건부 UPDATE 한 번(claimed_at IS NULL)으로 표시·수령을 함께 해 단건 수령과 겹쳐도 이중 지급이 없다
 *    (먼저 잡은 쪽이 찍고, 뒤 쪽은 행 잠금이 풀린 뒤 조건을 다시 보아 건너뛴다).
 *  - 아직 정산 전(status≠'settled')인 레이드는 빠진다. 상자는 슬롯별로 합쳐 한 번씩 적립.
 *  - 받을 것이 없으면 빈 결과(오류 아님) — 다른 기기에서 먼저 받은 경우.
 */
export function claimAllRaidRewards(input: { userId: string; serverId: number }): Promise<ClaimAllRaidResult> {
  const { userId, serverId } = input;
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      update raid_rewards rr set claimed_at = now()
      from raids r
      where r.id = rr.raid_id and rr.user_id = ${userId}::uuid and rr.claimed_at is null
        and r.server_id = ${serverId} and r.status = 'settled'
      returning rr.raid_id::text as raid_id, rr.boxes`)) as unknown as {
      raid_id: string;
      boxes: Partial<Record<SupplySlot, number>> | null;
    }[];

    const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
    for (const r of rows) for (const slot of SUPPLY_SLOTS) boxes[slot] += Number(r.boxes?.[slot] ?? 0);
    for (const slot of SUPPLY_SLOTS) {
      const n = boxes[slot];
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, serverId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
      }
    }
    return { raidIds: rows.map((r) => r.raid_id), boxes };
  });
}
