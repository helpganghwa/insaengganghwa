import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { characters } from '@/lib/db/schema/server';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { battlePassState, battlePassSegments } from '@/lib/db/schema/battlepass';
import { type Slot } from '@/lib/db/schema/equipment';
import {
  type BattlePassType,
  bpSegmentIndex,
  bpSegmentEndLevel,
  bpTierReward,
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
  serverId: number,
  type: BattlePassType,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  if (type === 'enhance') {
    await walletAdd(tx, userId, serverId, amount);
    return;
  }
  const dist = splitBoxes(amount);
  for (const slot of SLOTS) {
    if (dist[slot] <= 0) continue;
    await tx
      .insert(userSupplyBoxes)
      .values({ userId, serverId, slot, count: BigInt(dist[slot]) })
      .onConflictDoUpdate({
        target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
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
  serverId: number,
  type: BattlePassType,
): Promise<BattlePassView> {
  const reached = await getMaxReached(userId, serverId);
  const maxReached = type === 'enhance' ? reached.maxEnhance : reached.maxTranscend;

  const [stateRow] = await db
    .select({ tiers: battlePassState.freeClaimedTiers })
    .from(battlePassState)
    .where(and(eq(battlePassState.userId, userId), eq(battlePassState.serverId, serverId), eq(battlePassState.passType, type)));
  const freeClaimed = new Set(stateRow?.tiers ?? []);

  const segRows = await db
    .select({
      idx: battlePassSegments.segmentIndex,
      tiers: battlePassSegments.premiumClaimedTiers,
    })
    .from(battlePassSegments)
    .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.serverId, serverId), eq(battlePassSegments.passType, type)));
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

const reachedFor = async (userId: string, serverId: number, type: BattlePassType) => {
  const r = await getMaxReached(userId, serverId);
  return type === 'enhance' ? r.maxEnhance : r.maxTranscend;
};
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

// ── 무료 라인 수령 — 집합 기반(개별 단계 비순차 수령) ─────────────────────────

/** 무료 — 받을 수 있는 모든 마일스톤 일괄 수령(컬럼 하단 '한번에 받기'). */
export function claimFree(
  userId: string,
  serverId: number,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.serverId, serverId), eq(battlePassState.passType, type)))
      .for('update');
    const claimed = new Set(s?.tiers ?? []);
    const maxReached = await reachedFor(userId, serverId, type);
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
    await grantReward(tx, userId, serverId, type, granted);
    const merged = sorted([...claimed, ...newly]);
    await tx
      .insert(battlePassState)
      .values({ userId, serverId, passType: type, freeClaimedTiers: merged })
      .onConflictDoUpdate({
        target: [battlePassState.userId, battlePassState.serverId, battlePassState.passType],
        set: { freeClaimedTiers: merged },
      });
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

/** 무료 — **클릭한 단계 하나만** 수령. 마일스톤·도달·미수령 검증. */
export function claimFreeTier(
  userId: string,
  serverId: number,
  type: BattlePassType,
  level: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.serverId, serverId), eq(battlePassState.passType, type)))
      .for('update');
    const claimed = new Set(s?.tiers ?? []);
    const maxReached = await reachedFor(userId, serverId, type);
    const lv = Math.floor(level);
    if (lv < 1 || lv % BP_TIER_STEP[type] !== 0 || lv > maxReached || claimed.has(lv))
      throw new BattlePassErr('NOTHING_TO_CLAIM');
    const granted = bpTierReward(type, lv, false);
    await grantReward(tx, userId, serverId, type, granted);
    const merged = sorted([...claimed, lv]);
    await tx
      .insert(battlePassState)
      .values({ userId, serverId, passType: type, freeClaimedTiers: merged })
      .onConflictDoUpdate({
        target: [battlePassState.userId, battlePassState.serverId, battlePassState.passType],
        set: { freeClaimedTiers: merged },
      });
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

// ── 프리미엄 라인 수령 ────────────────────────────────────────────────────────

/** 프리미엄 — 산 구간들에서 받을 수 있는 모든 마일스톤 일괄 수령. */
export function claimPremium(
  userId: string,
  serverId: number,
  type: BattlePassType,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const maxReached = await reachedFor(userId, serverId, type);
    const segs = await tx
      .select({
        idx: battlePassSegments.segmentIndex,
        tiers: battlePassSegments.premiumClaimedTiers,
      })
      .from(battlePassSegments)
      .where(and(eq(battlePassSegments.userId, userId), eq(battlePassSegments.serverId, serverId), eq(battlePassSegments.passType, type)))
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
            eq(battlePassSegments.serverId, serverId),
            eq(battlePassSegments.passType, type),
            eq(battlePassSegments.segmentIndex, seg.idx),
          ),
        );
    }
    if (granted <= 0) throw new BattlePassErr('NOTHING_TO_CLAIM');
    await grantReward(tx, userId, serverId, type, granted);
    return { granted, rewardKind: type === 'enhance' ? 'diamond' : 'box' };
  });
}

/** 프리미엄 — 산 구간에서 **클릭한 단계 하나만** 수령. 미구매면 NOT_PURCHASED. */
export function claimPremiumTier(
  userId: string,
  serverId: number,
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
          eq(battlePassSegments.serverId, serverId),
          eq(battlePassSegments.passType, type),
          eq(battlePassSegments.segmentIndex, segmentIndex),
        ),
      )
      .for('update');
    if (!seg) throw new BattlePassErr('NOT_PURCHASED');
    const maxReached = await reachedFor(userId, serverId, type);
    const lv = Math.floor(level);
    const startLevel = segmentIndex * BP_SEGMENT_SIZE[type] + 1;
    const cap = Math.min(maxReached, bpSegmentEndLevel(type, segmentIndex));
    const claimed = new Set(seg.tiers);
    if (lv % BP_TIER_STEP[type] !== 0 || lv < startLevel || lv > cap || claimed.has(lv))
      throw new BattlePassErr('NOTHING_TO_CLAIM');
    const granted = bpTierReward(type, lv, true);
    await grantReward(tx, userId, serverId, type, granted);
    const merged = sorted([...seg.tiers, lv]);
    await tx
      .update(battlePassSegments)
      .set({ premiumClaimedTiers: merged })
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.serverId, serverId),
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
  serverId: number,
  type: BattlePassType,
  segmentIndex: number,
): Promise<{ granted: number; rewardKind: 'diamond' | 'box' }> {
  return db.transaction(async (tx) => {
    const maxReached = await reachedFor(userId, serverId, type);
    const startLevel = segmentIndex * BP_SEGMENT_SIZE[type] + 1;
    const cap = Math.min(maxReached, bpSegmentEndLevel(type, segmentIndex));
    const levels = tierLevelsIn(type, startLevel, cap);
    if (levels.length === 0) throw new BattlePassErr('NOTHING_TO_CLAIM');

    const [s] = await tx
      .select({ tiers: battlePassState.freeClaimedTiers })
      .from(battlePassState)
      .where(and(eq(battlePassState.userId, userId), eq(battlePassState.serverId, serverId), eq(battlePassState.passType, type)))
      .for('update');
    const freeClaimed = new Set(s?.tiers ?? []);

    const [seg] = await tx
      .select({ tiers: battlePassSegments.premiumClaimedTiers })
      .from(battlePassSegments)
      .where(
        and(
          eq(battlePassSegments.userId, userId),
          eq(battlePassSegments.serverId, serverId),
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
    await grantReward(tx, userId, serverId, type, granted);

    if (freeNew.length > 0) {
      const merged = sorted([...freeClaimed, ...freeNew]);
      await tx
        .insert(battlePassState)
        .values({ userId, serverId, passType: type, freeClaimedTiers: merged })
        .onConflictDoUpdate({
          target: [battlePassState.userId, battlePassState.serverId, battlePassState.passType],
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
            eq(battlePassSegments.serverId, serverId),
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

/**
 * 프리미엄 구간 구매(tx) — **해금만**. 보상은 유저가 수동 수령(소급분 포함)하므로 여기선 지급하지 않는다.
 *  premiumClaimedTiers를 빈 채로 두어 구매 직후엔 미수령 상태(=환불 가능). 이후 유저가 단계/구간
 *  수령(claimPremiumTier·claimSegment)으로 받는다. 이미 구매한 구간이면 null(멱등).
 *  **결제 트랜잭션·직접구매 공용 단일 원천.**
 */
export async function applyBpSegmentPurchase(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
  type: BattlePassType,
  segmentIndex: number,
): Promise<{ rewardKind: 'diamond' | 'box' } | null> {
  // 구간 row 생성(=해금). 이미 있으면 빈 결과 = 이미 구매. 보상은 미지급(수동 수령).
  const ins = await tx
    .insert(battlePassSegments)
    .values({ userId, serverId, passType: type, segmentIndex, premiumClaimedTiers: [] })
    .onConflictDoNothing()
    .returning({ idx: battlePassSegments.segmentIndex });
  if (ins.length === 0) return null;

  return { rewardKind: type === 'enhance' ? 'diamond' : 'box' };
}

/**
 * 그 구간 프리미엄 보상을 하나라도 수령했는지 — 환불 가능성 판정.
 * 구매 즉시 소급 수령된 구간은 premiumClaimedTiers가 차 있어 true(수령함=환불 불가).
 * 미수령(미도달 구간을 미리 산 경우 등)이면 false(환불 가능).
 */
export async function bpSegmentClaimedAny(
  userId: string,
  serverId: number,
  type: BattlePassType,
  segmentIndex: number,
): Promise<boolean> {
  const [seg] = await db
    .select({ tiers: battlePassSegments.premiumClaimedTiers })
    .from(battlePassSegments)
    .where(
      and(
        eq(battlePassSegments.userId, userId),
        eq(battlePassSegments.serverId, serverId),
        eq(battlePassSegments.passType, type),
        eq(battlePassSegments.segmentIndex, segmentIndex),
      ),
    )
    .limit(1);
  return !!seg && seg.tiers.length > 0;
}

/**
 * 배틀패스 구간 환불 회수(tx) — 구간 row 삭제(프리미엄 재잠금) + 받았던 프리미엄 보상 회수(0 클램프).
 * 미수령(claimedTiers 빈) 구간이면 회수액 0 → row 삭제만(재구매 가능). 결제 환불 tx에서 호출.
 */
export async function reclaimBpSegment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
  type: BattlePassType,
  segmentIndex: number,
): Promise<void> {
  const cond = and(
    eq(battlePassSegments.userId, userId),
    eq(battlePassSegments.serverId, serverId),
    eq(battlePassSegments.passType, type),
    eq(battlePassSegments.segmentIndex, segmentIndex),
  );
  const [seg] = await tx
    .select({ tiers: battlePassSegments.premiumClaimedTiers })
    .from(battlePassSegments)
    .where(cond)
    .limit(1);
  if (!seg) return; // 미구매/이미 환불.

  let total = 0;
  for (const tl of seg.tiers) total += bpTierReward(type, tl, true);

  await tx.delete(battlePassSegments).where(cond); // 재잠금.

  if (total > 0) {
    if (type === 'enhance') {
      await tx
        .update(characters)
        .set({ diamond: sql`GREATEST(0, ${characters.diamond} - ${total})` })
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
    } else {
      const dist = splitBoxes(total);
      for (const slot of SLOTS) {
        if (dist[slot] > 0) {
          await tx
            .update(userSupplyBoxes)
            .set({ count: sql`GREATEST(0, ${userSupplyBoxes.count} - ${dist[slot]})` })
            .where(
              and(
                eq(userSupplyBoxes.userId, userId),
                eq(userSupplyBoxes.serverId, serverId),
                eq(userSupplyBoxes.slot, slot),
              ),
            );
        }
      }
    }
  }
}
