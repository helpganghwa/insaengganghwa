import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { userCheckinState, checkinClaimLogs } from '@/lib/db/schema/checkin';
import {
  CHECKIN_CYCLE_DAYS,
  CHECKIN_COMPLETE_BONUS_DIAMOND,
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
  constructor(public code: 'CHECKIN_ALREADY_CLAIMED' | 'NO_CHARACTER') {
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
  /** 완주 보너스(28번째 수령 시 칸 보상과 별도 1회) — 미완주 0. */
  completeBonusDiamond: number;
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
  const { userId, serverId } = input;
  return db.transaction(async (tx) => {
    // 0) 캐릭터 존재 가드(2026-07-10 감사 R3, 일일메일 패턴 통일) — srv 쿠키 변조로 미오픈
    //    신서버에 출석 진행/상자를 선적립(오픈 즉시 재고+진행도 보유)하는 것 차단.
    const [ch] = (await tx.execute(
      sql`select 1 from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId} limit 1`,
    )) as unknown as unknown[];
    if (!ch) throw new CheckinError('NO_CHARACTER');

    // 1) state UPSERT — 신규는 dp=0/last=null 생성, 기존은 그대로(NO-OP). `for update`는
    //    INSERT … ON CONFLICT DO UPDATE 후 별도 SELECT FOR UPDATE로 잠금 확보.
    await tx
      .insert(userCheckinState)
      .values({ userId, serverId, dayProgress: 0, lastClaimedKstDay: null, totalClaimedCount: 0n })
      .onConflictDoNothing();

    // 2) 잠금 + KST 가드.
    // 잠금 + KST today를 한 SELECT에 통합 — 별도 now() 왕복 제거(감사 S5). KST는 DB 계산 유지(클럭 드리프트 0).
    const [state] = await tx
      .select({
        dayProgress: userCheckinState.dayProgress,
        lastClaimedKstDay: userCheckinState.lastClaimedKstDay,
        totalClaimedCount: userCheckinState.totalClaimedCount,
        kstToday: sql<string>`(now() at time zone 'Asia/Seoul')::date::text`,
      })
      .from(userCheckinState)
      .where(and(eq(userCheckinState.userId, userId), eq(userCheckinState.serverId, serverId)))
      .for('update');

    if (!state) throw new Error('CHECKIN_STATE_MISSING'); // upsert 직후 → 없을 수 없음
    const kstToday = state.kstToday;
    if (state.lastClaimedKstDay === kstToday) {
      throw new CheckinError('CHECKIN_ALREADY_CLAIMED');
    }

    // 3) 보상 분기 & 분배.
    const cycleDay = nextCheckinDay1Indexed(state.dayProgress);
    const reward = checkinRewardForDay(cycleDay);
    const acc = emptyAcc();
    applyRewardToAcc(reward, acc);
    // 완주 보너스(BALANCE §7.2) — 28번째 칸은 칸 보상 + 별도 보너스를 같은 트랜잭션에서 지급.
    const completeBonus = cycleDay === CHECKIN_CYCLE_DAYS ? CHECKIN_COMPLETE_BONUS_DIAMOND * TEST_REWARD_MULTIPLIER : 0;
    acc.diamond += completeBonus;

    if (acc.diamond > 0) {
      await walletAdd(tx, userId, input.serverId, acc.diamond);
    }
    // 보급 상자 — 슬롯별 upsert를 단일 multi-row로(감사 S5, 왕복 최대 3→1).
    const boxVals = SUPPLY_SLOTS.filter((s) => acc.boxes[s] > 0).map((s) => ({
      userId,
      serverId,
      slot: s,
      count: BigInt(acc.boxes[s]),
    }));
    if (boxVals.length > 0) {
      await tx
        .insert(userSupplyBoxes)
        .values(boxVals)
        .onConflictDoUpdate({
          target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
          set: { count: sql`${userSupplyBoxes.count} + excluded.count` },
        });
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
      .where(
        and(
          eq(userCheckinState.userId, userId),
          eq(userCheckinState.serverId, serverId),
          eq(userCheckinState.dayProgress, state.dayProgress),
        ),
      );

    await tx.insert(checkinClaimLogs).values({
      userId,
      serverId,
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
      completeBonusDiamond: completeBonus,
    };
  });
}

/** UI 조회 — 현재 state. 없으면 dp=0/last=null/total=0n. */
export async function getCheckinState(userId: string, serverId: number): Promise<{
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
    .where(and(eq(userCheckinState.userId, userId), eq(userCheckinState.serverId, serverId)))
    .limit(1);
  if (!r) return { dayProgress: 0, lastClaimedKstDay: null, totalClaimedCount: 0n };
  return r;
}
