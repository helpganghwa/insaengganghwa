import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { battlePassState, battlePassSegments } from '@/lib/db/schema/battlepass';
import { type Slot } from '@/lib/db/schema/equipment';
import {
  type BattlePassType,
  bpSegmentIndex,
  bpSegmentEndLevel,
  bpTierReward,
  bpRangeReward,
  bpSegmentPriceKrw,
  BP_SEGMENT_SIZE,
} from '@/lib/game/balance';
import { getMaxReached } from '@/lib/game/codex/max-reached';

/**
 * 배틀패스 — BALANCE §9 / SCHEMA §14. 성장 패스(만료 없음). 진행도 = 계정 최고 도달.
 * 무료 라인은 전 구간 항상 수령, 프리미엄은 산 구간만(소급). 보상: 강화=다이아, 초월=보급상자.
 */
export type BattlePassError = 'NOTHING_TO_CLAIM' | 'ALREADY_PURCHASED' | 'SEGMENT_LOCKED';
export class BattlePassErr extends Error {
  constructor(public code: BattlePassError) {
    super(code);
    this.name = 'BattlePassErr';
  }
}

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** N개 보급상자를 3슬롯에 분배(균등 + 나머지 무작위 슬롯). */
function splitBoxes(n: number): Record<Slot, number> {
  const base = Math.floor(n / 3);
  const out: Record<Slot, number> = { weapon: base, armor: base, accessory: base };
  let rem = n % 3;
  const pool = [...SLOTS];
  while (rem > 0 && pool.length > 0) {
    const i = rngU32() % pool.length;
    out[pool[i]!] += 1;
    pool.splice(i, 1);
    rem--;
  }
  return out;
}

/** 보상 지급 — 강화=다이아 가산, 초월=보급상자 슬롯 분배 가산. (tx 내) */
async function grantReward(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  type: BattlePassType,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  if (type === 'enhance') {
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${amount}` })
      .where(eq(profiles.id, userId));
    return;
  }
  const dist = splitBoxes(amount);
  for (const slot of SLOTS) {
    if (dist[slot] <= 0) continue;
    await tx
      .insert(userSupplyBoxes)
      .values({ userId, slot, count: BigInt(dist[slot]) })
      .onConflictDoUpdate({
        target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
        set: { count: sql`${userSupplyBoxes.count} + ${dist[slot]}` },
      });
  }
}

// ── 조회 (UI) ────────────────────────────────────────────────────────────────

export type BattlePassSegmentView = {
  index: number;
  startLevel: number;
  endLevel: number;
  priceKrw: number;
  purchased: boolean;
  /** 이 구간에서 도달한 단계 수(0~size). */
  reachedTiers: number;
  freePerTier: number;
  premiumPerTier: number;
  /** 프리미엄 수령 완료한 최고 단계(level). 미구매면 startLevel-1(아무것도 수령 안 함). */
  premiumClaimedThrough: number;
  /** 구매 시 지금 수령 가능한 프리미엄 보상(미구매면 0). */
  premiumClaimable: number;
};

export type BattlePassView = {
  passType: BattlePassType;
  rewardKind: 'diamond' | 'box';
  maxReached: number;
  segmentSize: number;
  free: { claimedThrough: number; claimable: number };
  segments: BattlePassSegmentView[];
};

export async function getBattlePassView(
  userId: string,
  type: BattlePassType,
): Promise<BattlePassView> {
  const reached = await getMaxReached(userId);
  const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;

  const [stateRow] = await db
    .select({ ft: battlePassState.freeClaimedThrough })
    .from(battlePassState)
    .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)));
  const freeClaimedThrough = stateRow?.ft ?? 0;

  const segRows = await db
    .select({
      idx: battlePassSegments.segmentIndex,
      pct: battlePassSegments.premiumClaimedThrough,
    })
    .from(battlePassSegments)
    .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.passType, type)));
  const purchasedMap = new Map(segRows.map((r) => [r.idx, r.pct]));

  // 현재 속한 구간까지만 노출(다음 구간 미노출 — 2026-06-04 피드백).
  const topSegment = maxReached >= 1 ? bpSegmentIndex(type, maxReached) : 0;
  const segments: BattlePassSegmentView[] = [];
  for (let c = 0; c <= topSegment; c++) {
    const startLevel = c * BP_SEGMENT_SIZE[type] + 1;
    const endLevel = bpSegmentEndLevel(type, c);
    const reachedInSeg = Math.max(0, Math.min(maxReached, endLevel) - (startLevel - 1));
    const purchased = purchasedMap.has(c);
    const pct = purchasedMap.get(c) ?? startLevel - 1;
    const premiumClaimable = purchased
      ? bpRangeReward(type, pct, Math.min(maxReached, endLevel), true)
      : 0;
    segments.push({
      index: c,
      startLevel,
      endLevel,
      priceKrw: bpSegmentPriceKrw(type, c),
      purchased,
      reachedTiers: reachedInSeg,
      freePerTier: bpTierReward(type, startLevel, false),
      premiumPerTier: bpTierReward(type, startLevel, true),
      premiumClaimedThrough: pct,
      premiumClaimable,
    });
  }

  return {
    passType: type,
    rewardKind: type === 'enhance' ? 'diamond' : 'box',
    maxReached,
    segmentSize: BP_SEGMENT_SIZE[type],
    free: {
      claimedThrough: freeClaimedThrough,
      claimable: bpRangeReward(type, freeClaimedThrough, maxReached, false),
    },
    segments,
  };
}

// ── 무료 라인 수령 ───────────────────────────────────────────────────────────

export function claimFree(
  userId: string,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ ft: battlePassState.freeClaimedThrough })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)))
      .for('update');
    const claimedThrough = s?.ft ?? 0;

    const reached = await getMaxReached(userId);
    const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;
    const granted = bpRangeReward(type, claimedThrough, maxReached, false);
    if (granted <= 0) throw new BattlePassErr('NOTHING_TO_CLAIM');

    await grantReward(tx, userId, type, granted);
    await tx
      .insert(battlePassState)
      .values({ userId, passType: type, freeClaimedThrough: maxReached })
      .onConflictDoUpdate({
        target: [battlePassState.userId, battlePassState.passType],
        set: { freeClaimedThrough: maxReached },
      });
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

// ── 프리미엄 라인 수령(산 구간 전체) ──────────────────────────────────────────

export function claimPremium(
  userId: string,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const reached = await getMaxReached(userId);
    const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;

    const segs = await tx
      .select({
        idx: battlePassSegments.segmentIndex,
        pct: battlePassSegments.premiumClaimedThrough,
      })
      .from(battlePassSegments)
      .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.passType, type)))
      .for('update');

    let granted = 0;
    for (const seg of segs) {
      const endLevel = bpSegmentEndLevel(type, seg.idx);
      const target = Math.min(maxReached, endLevel);
      const delta = bpRangeReward(type, seg.pct, target, true);
      if (delta <= 0) continue;
      granted += delta;
      await tx
        .update(battlePassSegments)
        .set({ premiumClaimedThrough: target })
        .where(
          and(
            eq(battlePassSegments.userId, userId),
            eq(battlePassSegments.passType, type),
            eq(battlePassSegments.segmentIndex, seg.idx),
          ),
        );
    }
    if (granted <= 0) throw new BattlePassErr('NOTHING_TO_CLAIM');
    await grantReward(tx, userId, type, granted);
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

// ── 프리미엄 구간 구매(결제 성공 후 지급 — 소급 포함) ─────────────────────────
// 결제 백엔드(포트원) 연동 시 결제 검증 후 호출. 구매 즉시 이미 넘긴 단계 소급 수령.

export function grantSegmentPurchase(
  userId: string,
  type: BattlePassType,
  segmentIndex: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const startMinusOne = segmentIndex * BP_SEGMENT_SIZE[type];
    const endLevel = bpSegmentEndLevel(type, segmentIndex);

    const reached = await getMaxReached(userId);
    const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;
    const target = Math.min(maxReached, endLevel);
    const granted = bpRangeReward(type, startMinusOne, target, true);

    // 구간 row 생성(이미 있으면 ALREADY_PURCHASED) — premium_claimed_through = 소급 지급분.
    const ins = await tx
      .insert(battlePassSegments)
      .values({
        userId,
        passType: type,
        segmentIndex,
        premiumClaimedThrough: target,
      })
      .onConflictDoNothing()
      .returning({ idx: battlePassSegments.segmentIndex });
    if (ins.length === 0) throw new BattlePassErr('ALREADY_PURCHASED');

    await grantReward(tx, userId, type, granted);
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}
