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
  BP_TIER_STEP,
} from '@/lib/game/balance';
import { getMaxReached } from '@/lib/game/codex/max-reached';

/**
 * 배틀패스 — BALANCE §9 / SCHEMA §14. 성장 패스(만료 없음). 진행도 = 계정 최고 도달.
 * 무료 라인은 전 구간 항상 수령, 프리미엄은 산 구간만(소급). 보상: 강화=다이아, 초월=보급상자.
 */
export type BattlePassError =
  | 'NOTHING_TO_CLAIM'
  | 'ALREADY_PURCHASED'
  | 'SEGMENT_LOCKED'
  | 'NOT_PURCHASED';
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
  /** 그 구간 프리미엄에서 개별 수령 완료한 마일스톤 단계 집합. */
  premiumClaimedTiers: number[];
  /** 구매 시 지금 수령 가능한 프리미엄 보상(미구매면 0). */
  premiumClaimable: number;
};

export type BattlePassView = {
  passType: BattlePassType;
  rewardKind: 'diamond' | 'box';
  maxReached: number;
  segmentSize: number;
  /** 보상 마일스톤 간격 — 강화 10, 초월 1. 클라이언트는 step 배수 단계만 렌더. */
  tierStep: number;
  free: { claimedTiers: number[]; claimable: number };
  segments: BattlePassSegmentView[];
};

/** [startLevel, cap] 안의 마일스톤(step 배수) 단계 목록. */
function tierLevelsIn(type: BattlePassType, startLevel: number, cap: number): number[] {
  const step = BP_TIER_STEP[type];
  const out: number[] = [];
  for (let l = Math.ceil(startLevel / step) * step; l <= cap; l += step) out.push(l);
  return out;
}

export async function getBattlePassView(
  userId: string,
  type: BattlePassType,
): Promise<BattlePassView> {
  const reached = await getMaxReached(userId);
  const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;

  const [stateRow] = await db
    .select({ tiers: battlePassState.freeClaimedTiers })
    .from(battlePassState)
    .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)));
  const freeClaimed = new Set(stateRow?.tiers ?? []);

  const segRows = await db
    .select({
      idx: battlePassSegments.segmentIndex,
      tiers: battlePassSegments.premiumClaimedTiers,
    })
    .from(battlePassSegments)
    .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.passType, type)));
  const premMap = new Map(segRows.map((r) => [r.idx, r.tiers]));

  // 현재 속한 구간까지만 노출(다음 구간 미노출 — 2026-06-04 피드백).
  const topSegment = maxReached >= 1 ? bpSegmentIndex(type, maxReached) : 0;
  const segments: BattlePassSegmentView[] = [];
  let freeClaimable = 0;
  for (let c = 0; c <= topSegment; c++) {
    const startLevel = c * BP_SEGMENT_SIZE[type] + 1;
    const endLevel = bpSegmentEndLevel(type, c);
    const reachedInSeg = Math.max(0, Math.min(maxReached, endLevel) - (startLevel - 1));
    const tiers = tierLevelsIn(type, startLevel, Math.min(maxReached, endLevel));
    for (const l of tiers) if (!freeClaimed.has(l)) freeClaimable += bpTierReward(type, l, false);

    const purchased = premMap.has(c);
    const premClaimed = premMap.get(c) ?? [];
    const premClaimedSet = new Set(premClaimed);
    let premiumClaimable = 0;
    if (purchased)
      for (const l of tiers) if (!premClaimedSet.has(l)) premiumClaimable += bpTierReward(type, l, true);

    segments.push({
      index: c,
      startLevel,
      endLevel,
      priceKrw: bpSegmentPriceKrw(type, c),
      purchased,
      reachedTiers: reachedInSeg,
      freePerTier: bpTierReward(type, startLevel, false),
      premiumPerTier: bpTierReward(type, startLevel, true),
      premiumClaimedTiers: premClaimed,
      premiumClaimable,
    });
  }

  return {
    passType: type,
    rewardKind: type === 'enhance' ? 'diamond' : 'box',
    maxReached,
    segmentSize: BP_SEGMENT_SIZE[type],
    tierStep: BP_TIER_STEP[type],
    free: { claimedTiers: [...freeClaimed], claimable: freeClaimable },
    segments,
  };
}

const reachedFor = async (userId: string, type: BattlePassType) => {
  const r = await getMaxReached(userId);
  return type === 'enhance' ? r.maxEnhance : r.maxTranscend;
};
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

// ── 무료 라인 수령 — 집합 기반(개별 단계 비순차 수령) ─────────────────────────

/** 무료 — 받을 수 있는 모든 마일스톤 일괄 수령(컬럼 하단 '한번에 받기'). */
export function claimFree(
  userId: string,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)))
      .for('update');
    const claimed = new Set(s?.tiers ?? []);
    const maxReached = await reachedFor(userId, type);
    const top = maxReached >= 1 ? bpSegmentIndex(type, maxReached) : 0;
    const newly: number[] = [];
    let granted = 0;
    for (let c = 0; c <= top; c++) {
      const startLevel = c * BP_SEGMENT_SIZE[type] + 1;
      const cap = Math.min(maxReached, bpSegmentEndLevel(type, c));
      for (const l of tierLevelsIn(type, startLevel, cap))
        if (!claimed.has(l)) {
          newly.push(l);
          granted += bpTierReward(type, l, false);
        }
    }
    if (granted <= 0) throw new BattlePassErr('NOTHING_TO_CLAIM');
    await grantReward(tx, userId, type, granted);
    const merged = sorted([...claimed, ...newly]);
    await tx
      .insert(battlePassState)
      .values({ userId, passType: type, freeClaimedTiers: merged })
      .onConflictDoUpdate({
        target: [battlePassState.userId, battlePassState.passType],
        set: { freeClaimedTiers: merged },
      });
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

/** 무료 — **클릭한 단계 하나만** 수령. 마일스톤·도달·미수령 검증. */
export function claimFreeTier(
  userId: string,
  type: BattlePassType,
  level: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)))
      .for('update');
    const claimed = new Set(s?.tiers ?? []);
    const maxReached = await reachedFor(userId, type);
    const lv = Math.floor(level);
    if (lv < 1 || lv % BP_TIER_STEP[type] !== 0 || lv > maxReached || claimed.has(lv))
      throw new BattlePassErr('NOTHING_TO_CLAIM');
    const granted = bpTierReward(type, lv, false);
    await grantReward(tx, userId, type, granted);
    const merged = sorted([...claimed, lv]);
    await tx
      .insert(battlePassState)
      .values({ userId, passType: type, freeClaimedTiers: merged })
      .onConflictDoUpdate({
        target: [battlePassState.userId, battlePassState.passType],
        set: { freeClaimedTiers: merged },
      });
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

// ── 프리미엄 라인 수령 ────────────────────────────────────────────────────────

/** 프리미엄 — 산 구간들에서 받을 수 있는 모든 마일스톤 일괄 수령. */
export function claimPremium(
  userId: string,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const maxReached = await reachedFor(userId, type);
    const segs = await tx
      .select({
        idx: battlePassSegments.segmentIndex,
        tiers: battlePassSegments.premiumClaimedTiers,
      })
      .from(battlePassSegments)
      .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.passType, type)))
      .for('update');

    let granted = 0;
    for (const seg of segs) {
      const startLevel = seg.idx * BP_SEGMENT_SIZE[type] + 1;
      const cap = Math.min(maxReached, bpSegmentEndLevel(type, seg.idx));
      const claimed = new Set(seg.tiers);
      const newly: number[] = [];
      for (const l of tierLevelsIn(type, startLevel, cap))
        if (!claimed.has(l)) {
          newly.push(l);
          granted += bpTierReward(type, l, true);
        }
      if (newly.length === 0) continue;
      const merged = sorted([...seg.tiers, ...newly]);
      await tx
        .update(battlePassSegments)
        .set({ premiumClaimedTiers: merged })
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

/** 프리미엄 — 산 구간에서 **클릭한 단계 하나만** 수령. 미구매면 NOT_PURCHASED. */
export function claimPremiumTier(
  userId: string,
  type: BattlePassType,
  segmentIndex: number,
  level: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [seg] = await tx
      .select({ tiers: battlePassSegments.premiumClaimedTiers })
      .from(battlePassSegments)
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.passType, type),
          eq(battlePassSegments.segmentIndex, segmentIndex),
        ),
      )
      .for('update');
    if (!seg) throw new BattlePassErr('NOT_PURCHASED');
    const maxReached = await reachedFor(userId, type);
    const lv = Math.floor(level);
    const startLevel = segmentIndex * BP_SEGMENT_SIZE[type] + 1;
    const cap = Math.min(maxReached, bpSegmentEndLevel(type, segmentIndex));
    const claimed = new Set(seg.tiers);
    if (lv % BP_TIER_STEP[type] !== 0 || lv < startLevel || lv > cap || claimed.has(lv))
      throw new BattlePassErr('NOTHING_TO_CLAIM');
    const granted = bpTierReward(type, lv, true);
    await grantReward(tx, userId, type, granted);
    const merged = sorted([...seg.tiers, lv]);
    await tx
      .update(battlePassSegments)
      .set({ premiumClaimedTiers: merged })
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.passType, type),
          eq(battlePassSegments.segmentIndex, segmentIndex),
        ),
      );
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

/** 한 **구간**의 받을 수 있는 무료 + 프리미엄 마일스톤을 한 트랜잭션에 일괄 수령. */
export function claimSegment(
  userId: string,
  type: BattlePassType,
  segmentIndex: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const maxReached = await reachedFor(userId, type);
    const startLevel = segmentIndex * BP_SEGMENT_SIZE[type] + 1;
    const cap = Math.min(maxReached, bpSegmentEndLevel(type, segmentIndex));
    const levels = tierLevelsIn(type, startLevel, cap);
    if (levels.length === 0) throw new BattlePassErr('NOTHING_TO_CLAIM');

    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.passType, type)))
      .for('update');
    const freeClaimed = new Set(s?.tiers ?? []);

    const [seg] = await tx
      .select({ tiers: battlePassSegments.premiumClaimedTiers })
      .from(battlePassSegments)
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.passType, type),
          eq(battlePassSegments.segmentIndex, segmentIndex),
        ),
      )
      .for('update');

    let granted = 0;
    const freeNew: number[] = [];
    const premNew: number[] = [];
    for (const l of levels) {
      if (!freeClaimed.has(l)) {
        freeNew.push(l);
        granted += bpTierReward(type, l, false);
      }
      if (seg && !seg.tiers.includes(l)) {
        premNew.push(l);
        granted += bpTierReward(type, l, true);
      }
    }
    if (granted <= 0) throw new BattlePassErr('NOTHING_TO_CLAIM');
    await grantReward(tx, userId, type, granted);

    if (freeNew.length > 0) {
      const merged = sorted([...freeClaimed, ...freeNew]);
      await tx
        .insert(battlePassState)
        .values({ userId, passType: type, freeClaimedTiers: merged })
        .onConflictDoUpdate({
          target: [battlePassState.userId, battlePassState.passType],
          set: { freeClaimedTiers: merged },
        });
    }
    if (seg && premNew.length > 0) {
      const merged = sorted([...seg.tiers, ...premNew]);
      await tx
        .update(battlePassSegments)
        .set({ premiumClaimedTiers: merged })
        .where(
          and(
            eq(battlePassSegments.userId, userId),
            eq(battlePassSegments.passType, type),
            eq(battlePassSegments.segmentIndex, segmentIndex),
          ),
        );
    }
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

    // 구간 row 생성(이미 있으면 ALREADY_PURCHASED) — 소급 지급분을 claimed 집합에 표기.
    const ins = await tx
      .insert(battlePassSegments)
      .values({
        userId,
        passType: type,
        segmentIndex,
        premiumClaimedTiers: tierLevelsIn(type, startMinusOne + 1, target),
      })
      .onConflictDoNothing()
      .returning({ idx: battlePassSegments.segmentIndex });
    if (ins.length === 0) throw new BattlePassErr('ALREADY_PURCHASED');

    await grantReward(tx, userId, type, granted);
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}
