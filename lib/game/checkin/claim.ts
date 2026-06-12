import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { userCheckinState, checkinClaimLogs } from '@/lib/db/schema/checkin';
import {
  CHECKIN_CYCLE_DAYS,
  SUPPLY_SLOTS,
  advanceCheckinDayProgress,
  checkinRewardForDay,
  nextCheckinDay1Indexed,
  type CheckinReward,
  type SupplySlot,
} from '@/lib/game/balance';
import { TEST_REWARD_MULTIPLIER } from '@/lib/game/test-mode';

/**
 * 출석 캘린더 수령 — SCHEMA §12 · BALANCE §7.
 *
 * 멱등 가드(2중):
 *  1) state.last_claimed_kst_day = KST today → CHECKIN_ALREADY_CLAIMED
 *  2) checkin_claim_logs UNIQUE(user_id, kst_day) — DB 레벨 보조
 *
 * 단일 트랜잭션(CLAUDE §3.3):
 *  - UPSERT state with `for update` 의미 → KST 가드 → 보상 분기(diamond/supply) →
 *    state.dayProgress advance + last_claimed_kst_day=today + total_claimed_count++ →
 *    감사 로그 insert.
 */

export class CheckinError extends Error {
  constructor(public code: 'CHECKIN_ALREADY_CLAIMED') {
    super(code);
    this.name = 'CheckinError';
  }
}

export type CheckinClaimResult = {
  /** 이번에 수령한 칸(1~28). */
  cycleDay: number;
  /** 수령한 보상. */
  reward: CheckinReward;
  /** 누적 수령 횟수(이번 수령 포함). */
  totalClaimedCount: number;
  /** 다음 사이클 진입(28번째 수령 시 true) */
  cycleCompleted: boolean;
};

/** 분배 누적기. */
type Acc = { diamond: number; boxes: Record<SupplySlot, number> };
const emptyAcc = (): Acc => ({ diamond: 0, boxes: { weapon: 0, armor: 0, accessory: 0 } });

function applyRewardToAcc(reward: CheckinReward, acc: Acc) {
  const m = TEST_REWARD_MULTIPLIER;
  switch (reward.kind) {
    case 'diamond':
      acc.diamond += reward.amount * m;
      return;
    case 'supply':
      acc.boxes[reward.slot] += reward.count * m;
      return;
    case 'supply_set':
      for (const s of SUPPLY_SLOTS) acc.boxes[s] += reward.perSlot * m;
      return;
  }
}

export function claimCheckin(input: { userId: string; serverId: number }): Promise<CheckinClaimResult> {
  const { userId } = input;
  return db.transaction(async (tx) => {
    // 1) state UPSERT — 신규는 dp=0/last=null 생성, 기존은 그대로(NO-OP). `for update`는
    //    INSERT … ON CONFLICT DO UPDATE 후 별도 SELECT FOR UPDATE로 잠금 확보.
    await tx
      .insert(userCheckinState)
      .values({ userId, dayProgress: 0, lastClaimedKstDay: null, totalClaimedCount: 0n })
      .onConflictDoNothing();

    // 2) 잠금 + KST 가드.
    const [state] = await tx
      .select({
        dayProgress: userCheckinState.dayProgress,
        lastClaimedKstDay: userCheckinState.lastClaimedKstDay,
        totalClaimedCount: userCheckinState.totalClaimedCount,
      })
      .from(userCheckinState)
      .where(eq(userCheckinState.userId, userId))
      .for('update');

    if (!state) throw new Error('CHECKIN_STATE_MISSING'); // upsert 직후 → 없을 수 없음

    // KST today를 DB에서 계산해 클럭 드리프트 제거(CLAUDE §3.2/§3.8).
    const [today] = (await tx.execute(
      sql`select (now() at time zone 'Asia/Seoul')::date::text as d`,
    )) as unknown as Array<{ d: string }>;
    const kstToday = today!.d;
    if (state.lastClaimedKstDay === kstToday) {
      throw new CheckinError('CHECKIN_ALREADY_CLAIMED');
    }

    // 3) 보상 분기 & 분배.
    const cycleDay = nextCheckinDay1Indexed(state.dayProgress);
    const reward = checkinRewardForDay(cycleDay);
    const acc = emptyAcc();
    applyRewardToAcc(reward, acc);

    if (acc.diamond > 0) {
      await walletAdd(tx, userId, input.serverId, acc.diamond);
    }
    for (const slot of SUPPLY_SLOTS) {
      const n = acc.boxes[slot];
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
      }
    }

    // 4) state advance + claim log.
    const nextDp = advanceCheckinDayProgress(state.dayProgress);
    const newTotal = (state.totalClaimedCount ?? 0n) + 1n;
    await tx
      .update(userCheckinState)
      .set({
        dayProgress: nextDp,
        lastClaimedKstDay: kstToday,
        totalClaimedCount: newTotal,
        updatedAt: new Date(),
      })
      .where(and(eq(userCheckinState.userId, userId), eq(userCheckinState.dayProgress, state.dayProgress)));

    await tx.insert(checkinClaimLogs).values({
      userId,
      kstDay: kstToday,
      cycleDay,
      diamondGranted: BigInt(acc.diamond),
      boxesGranted: acc.boxes,
    });

    return {
      cycleDay,
      reward,
      totalClaimedCount: Number(newTotal),
      cycleCompleted: cycleDay === CHECKIN_CYCLE_DAYS,
    };
  });
}

/** UI 조회 — 현재 state. 없으면 dp=0/last=null/total=0n. */
export async function getCheckinState(userId: string): Promise<{
  dayProgress: number;
  lastClaimedKstDay: string | null;
  totalClaimedCount: bigint;
}> {
  const [r] = await db
    .select({
      dayProgress: userCheckinState.dayProgress,
      lastClaimedKstDay: userCheckinState.lastClaimedKstDay,
      totalClaimedCount: userCheckinState.totalClaimedCount,
    })
    .from(userCheckinState)
    .where(eq(userCheckinState.userId, userId))
    .limit(1);
  if (!r) return { dayProgress: 0, lastClaimedKstDay: null, totalClaimedCount: 0n };
  return r;
}
