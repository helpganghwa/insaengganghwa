import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids, raidParticipants, raidRewards } from '@/lib/db/schema/raid';
import { RAID_BASE_PARTICIPATION_DIAMOND } from '@/lib/game/balance';
import { aggregatePhaseDrops, raidPhasesCleared } from './drops';

/**
 * 레이드 정산 — GDD §3.5 / SCHEMA §6.4. 6시간 만료 시 lazy(접속 조회) + cron 일괄.
 * **멱등**: status='active' AND expire_at<=now() 조건부 → 'settled'. 보상 = 1회+ 공격
 * 전원 동일(기본 100 + 페이즈 결정론 추첨, drops.ts). 정산은 raid_rewards 적재만 —
 * 실제 지급은 유저가 레이드 상세에서 직접 수령(`claimRaidReward`, claim.ts).
 */
export function settleRaid(
  input: { raidId: bigint },
): Promise<{ settled: boolean; phasesCleared: number; rewarded: number }> {
  const { raidId } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
        status: raids.status,
        expireAt: raids.expireAt,
        phase1Hp: raids.phase1Hp,
      })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');

    // 멱등 no-op — 없거나 이미 정산됨.
    if (!raid || raid.status !== 'active') {
      return { settled: false, phasesCleared: 0, rewarded: 0 };
    }
    if (raid.expireAt.getTime() > Date.now()) {
      return { settled: false, phasesCleared: 0, rewarded: 0 }; // 아직 진행 중
    }

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${raidParticipants.totalDamage}), 0)` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId));
    const phasesCleared = raidPhasesCleared(Number(raid.phase1Hp), Number(total));
    const drops = aggregatePhaseDrops(raidId, phasesCleared);

    // 1회 이상 공격한 참여자 전원 동일 보상.
    const winners = await tx
      .select({ userId: raidParticipants.userId })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), gte(raidParticipants.attacksUsed, 1)));

    for (const w of winners) {
      await tx
        .insert(raidRewards)
        .values({
          raidId,
          userId: w.userId,
          baseDiamond: BigInt(RAID_BASE_PARTICIPATION_DIAMOND),
          phaseDiamond: BigInt(drops.diamond),
          boxes: drops.boxes,
        })
        .onConflictDoNothing({ target: [raidRewards.raidId, raidRewards.userId] });
    }

    await tx
      .update(raids)
      .set({ phasesCleared, status: 'settled', settledAt: new Date() })
      .where(and(eq(raids.id, raidId), eq(raids.status, 'active')));

    return { settled: true, phasesCleared, rewarded: winners.length };
  });
}
