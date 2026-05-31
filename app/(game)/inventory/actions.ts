'use server';

import { revalidatePath } from 'next/cache';

import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { catalogItems, equipmentInstances } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { equipItem, unequipItem, toggleEquipmentLock, equipBestSet, EquipError } from '@/lib/game/equipment/equip';
import { performTranscend, TranscendError } from '@/lib/game/transcend';
import { DIAMOND_PER_DISENCHANT, transcendFodderForStep } from '@/lib/game/balance';
import { disenchant } from '@/lib/game/supply';
import type { Slot } from '@/lib/db/schema/equipment';
import { getMyRanks, getMyRanksAfter, type MyRanks } from '@/lib/game/leaderboard/queries';

/** 액션 결과에 ranks before/after를 동봉(랭킹 토스트용). 실패 시 throw → 호출자 catch. */
async function withRanks<T extends object>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T & { ranksBefore: MyRanks; ranksAfter: MyRanks }> {
  const ranksBefore = await getMyRanks(userId);
  const result = await fn();
  const ranksAfter = await getMyRanksAfter(userId);
  return { ...result, ranksBefore, ranksAfter };
}

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  NOT_FOUND: '장비를 찾을 수 없습니다.',
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  EQUIPMENT_LOCKED: '잠긴 장비입니다.',
  TRANSCEND_MAX: '이미 최대 초월(10)입니다.',
  INSUFFICIENT_FODDER: '제물이 부족합니다 (같은 아이템, 미장착·미잠금).',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};
const err = (c: string): ErrorState => ({ status: 'error', code: c, message: MSG[c] ?? c });

function revalidate() {
  revalidatePath('/');
  revalidatePath('/inventory');
  revalidatePath('/enhance');
}
const uid = () => getSessionUserId();

export async function equipAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  try {
    const r = await withRanks(u, async () => {
      await equipItem(u, BigInt(id));
      return { status: 'success' as const };
    });
    revalidate();
    return r;
  } catch (e) {
    if (e instanceof EquipError) return err(e.code);
    console.error('[equip]', e);
    return err('UNKNOWN');
  }
}

export async function unequipAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  const r = await withRanks(u, async () => {
    await unequipItem(u, BigInt(id));
    return { status: 'success' as const };
  });
  revalidate();
  return r;
}

export async function toggleLockAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  try {
    const { isLocked } = await toggleEquipmentLock(u, BigInt(id));
    revalidate();
    return { status: 'success' as const, isLocked };
  } catch (e) {
    if (e instanceof EquipError) return err(e.code);
    return err('UNKNOWN');
  }
}

export async function equipBestSetAction() {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  const r = await withRanks(u, async () => {
    const { slotsUpdated } = await equipBestSet(u);
    return { status: 'success' as const, slotsUpdated };
  });
  revalidate();
  return r;
}

/**
 * 일괄 초월 시뮬레이션 (preview + execute 공유).
 * - 카탈로그별 그룹화 → 각 그룹의 target(transcend·enhance 가장 높은 1개) +
 *   fodder candidates(나머지 중 미장착·미잠금·강화/예약 안 됨).
 * - target.currentT에서 fodder 보유량으로 도달 가능한 maxT 계산
 *   (transcendFodderForStep 기반 누적).
 * - lockedTargets은 별도 보고(스킵).
 */
type BulkPlanRow = {
  catalogItemId: number;
  code: string;
  name: string;
  slot: Slot;
  targetInstanceId: bigint;
  currentT: number;
  maxT: number;
  fodderAvailable: number;
  fodderToConsume: number;
  totalCountInGroup: number;
  /** performTranscend fodder 쿼리 ORDER BY와 동일 정렬로 잡힐 ids — 낙관 UI용. */
  consumedFodderIds: bigint[];
};
type BulkPlan = {
  rows: BulkPlanRow[];
  skippedLockedTarget: number;
  skippedNoUpgrade: number; // fodder 0개 또는 1개로 1단계도 불가.
};

async function planBulkTranscend(userId: string): Promise<BulkPlan> {
  // 보유 장비 전체.
  const equips = (await db
    .select({
      id: equipmentInstances.id,
      catalogItemId: equipmentInstances.catalogItemId,
      transcendLevel: equipmentInstances.transcendLevel,
      enhanceLevel: equipmentInstances.enhanceLevel,
      isLocked: equipmentInstances.isLocked,
      equippedSlot: equipmentInstances.equippedSlot,
      code: catalogItems.code,
      name: catalogItems.name,
      slot: catalogItems.slot,
    })
    .from(equipmentInstances)
    .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
    .where(eq(equipmentInstances.userId, userId))) as unknown as Array<{
    id: bigint;
    catalogItemId: number;
    transcendLevel: number;
    enhanceLevel: number;
    isLocked: boolean;
    equippedSlot: string | null;
    code: string;
    name: string;
    slot: Slot;
  }>;

  // 강화 중 또는 강화 제물로 예약된 instance 집합 — fodder 후보에서 제외.
  const equipIds = equips.map((e) => BigInt(e.id));
  const busySet = new Set<string>();
  if (equipIds.length > 0) {
    const rows = await db
      .select({
        eq: enhancementJobs.equipmentInstanceId,
        fo: enhancementJobs.fodderInstanceId,
      })
      .from(enhancementJobs)
      .where(
        and(
          eq(enhancementJobs.userId, userId),
          eq(enhancementJobs.status, 'running'),
        ),
      );
    for (const r of rows) {
      if (r.eq != null) busySet.add(String(r.eq));
      if (r.fo != null) busySet.add(String(r.fo));
    }
  }

  // 카탈로그별 그룹 + 정렬(target 결정용: transcend desc → enhance desc → id asc).
  const groups = new Map<number, typeof equips>();
  for (const e of equips) {
    if (!groups.has(e.catalogItemId)) groups.set(e.catalogItemId, []);
    groups.get(e.catalogItemId)!.push(e);
  }

  const planRows: BulkPlanRow[] = [];
  let skippedLockedTarget = 0;
  let skippedNoUpgrade = 0;

  for (const [catalogItemId, list] of groups) {
    list.sort(
      (a, b) =>
        b.transcendLevel - a.transcendLevel ||
        b.enhanceLevel - a.enhanceLevel ||
        Number(a.id) - Number(b.id),
    );
    const target = list[0]!;
    if (target.isLocked) {
      skippedLockedTarget++;
      continue;
    }
    // 서버 performTranscend fodder 쿼리(약한 순)과 동일 정렬로 fodder identity 추적.
    const fodderCandidates = list
      .slice(1)
      .filter((f) => !f.isLocked && f.equippedSlot == null && !busySet.has(String(f.id)))
      .sort(
        (a, b) =>
          a.transcendLevel - b.transcendLevel ||
          a.enhanceLevel - b.enhanceLevel ||
          Number(a.id) - Number(b.id),
      );
    const fodderAvailable = fodderCandidates.length;
    let used = 0;
    let maxT = target.transcendLevel;
    const consumedFodderIds: bigint[] = [];
    for (let step = target.transcendLevel + 1; ; step++) {
      const need = transcendFodderForStep(step);
      if (used + need > fodderAvailable) break;
      for (let i = used; i < used + need; i++) {
        consumedFodderIds.push(BigInt(fodderCandidates[i]!.id));
      }
      used += need;
      maxT = step;
    }
    if (maxT === target.transcendLevel) {
      skippedNoUpgrade++;
      continue;
    }
    planRows.push({
      catalogItemId,
      code: target.code,
      name: target.name,
      slot: target.slot,
      targetInstanceId: BigInt(target.id),
      currentT: target.transcendLevel,
      maxT,
      fodderAvailable,
      fodderToConsume: used,
      totalCountInGroup: list.length,
      consumedFodderIds,
    });
  }

  // 표시 순서 — 큰 변동(maxT - currentT) 먼저, 그 다음 이름.
  planRows.sort(
    (a, b) => b.maxT - b.currentT - (a.maxT - a.currentT) || a.name.localeCompare(b.name, 'ko'),
  );

  return { rows: planRows, skippedLockedTarget, skippedNoUpgrade };
}

/** preview — UI에서 모달에 띄울 정보. 실행 없음. */
export async function previewBulkTranscendAction() {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  const plan = await planBulkTranscend(u);
  // BigInt → string 직렬화(클라이언트로 전송 안전).
  return {
    status: 'success' as const,
    rows: plan.rows.map((r) => ({
      catalogItemId: r.catalogItemId,
      code: r.code,
      name: r.name,
      slot: r.slot,
      targetInstanceId: r.targetInstanceId.toString(),
      currentT: r.currentT,
      maxT: r.maxT,
      fodderToConsume: r.fodderToConsume,
      fodderAvailable: r.fodderAvailable,
      totalCountInGroup: r.totalCountInGroup,
      consumedFodderIds: r.consumedFodderIds.map((i) => i.toString()),
    })),
    skippedLockedTarget: plan.skippedLockedTarget,
    skippedNoUpgrade: plan.skippedNoUpgrade,
  };
}

/**
 * 일괄 초월 실행 — preview와 동일 시뮬레이션으로 그룹별 maxT 계산 후,
 * target마다 (maxT - currentT) 회 performTranscend 호출. 각 호출은 자체 트랜잭션.
 * 한 건 실패해도 다른 그룹은 계속 진행.
 *
 * @param targetInstanceIds 선택한 target만 처리. 미지정/빈 배열이면 전체.
 */
export async function bulkTranscendAction(targetInstanceIds?: string[]) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');

  const ranksBefore = await getMyRanks(u);
  const plan = await planBulkTranscend(u);
  const selected =
    targetInstanceIds && targetInstanceIds.length > 0
      ? plan.rows.filter((r) => targetInstanceIds.includes(r.targetInstanceId.toString()))
      : plan.rows;
  let stepsApplied = 0;
  let targetsUpgraded = 0;
  let failedSteps = 0;
  const upgraded: Array<{ name: string; fromT: number; toT: number }> = [];

  for (const row of selected) {
    let curT = row.currentT;
    let success = false;
    for (let step = row.currentT + 1; step <= row.maxT; step++) {
      try {
        const r = await performTranscend({
          userId: u,
          equipmentInstanceId: row.targetInstanceId,
        });
        curT = r.toT;
        stepsApplied++;
        success = true;
      } catch (e) {
        // 시뮬레이션과 실제가 어긋난 케이스(다른 액션이 fodder 소비 등) — 중단하고 다음 그룹.
        if (!(e instanceof TranscendError)) {
          console.error('[bulk-transcend.execute]', e);
        }
        failedSteps++;
        break;
      }
    }
    if (success) {
      targetsUpgraded++;
      upgraded.push({ name: row.name, fromT: row.currentT, toT: curT });
    }
  }

  const ranksAfter = await getMyRanksAfter(u);
  // ranksBefore는 plan 시점에서 별도 fetch — 시뮬레이션 시작 직전이 가장 정확.
  // 단순화 위해 plan fetch 직전이 아니라 함수 시작 시점 캐시값 사용.
  revalidate();
  return {
    status: 'success' as const,
    stepsApplied,
    targetsUpgraded,
    failedSteps,
    skippedLockedTarget: plan.skippedLockedTarget,
    skippedNoUpgrade: plan.skippedNoUpgrade,
    upgraded,
    ranksBefore,
    ranksAfter,
  };
}

/** 초월 — 같은 카탈로그 아이템 제물 소모, 즉시·무RNG (GDD §3.3). */
export async function transcendAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  try {
    const r = await withRanks(u, async () => {
      const inner = await performTranscend({ userId: u, equipmentInstanceId: BigInt(id) });
      return {
        status: 'success' as const,
        fromT: inner.fromT,
        toT: inner.toT,
        fodder: inner.fodderConsumed,
      };
    });
    revalidate();
    return r;
  } catch (e) {
    if (e instanceof TranscendError) return err(e.code);
    console.error('[transcend]', e);
    return err('UNKNOWN');
  }
}

/** 분해 — 고정 2다이아 (BALANCE §4.4). */
export async function disenchantAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  const r = await disenchant({ userId: u, equipmentInstanceIds: [BigInt(id)] });
  if (r.disenchanted === 0) return err('NOT_FOUND');
  revalidate();
  return { status: 'success' as const, diamondGranted: r.diamondGranted };
}

/**
 * 일괄 분해 plan — 카탈로그별 그룹화, 그룹의 가장 강한 1개(transcend·enhance 가장
 * 높은 인스턴스)는 보존하고 나머지 적격 인스턴스(미장착·미잠금·강화중 아님·예약 아님)를
 * 분해 대상으로 묶음. 일괄 초월과 동일한 보존 정책 — 사용자가 가장 강한 개체를 실수로
 * 분해하지 않도록 default 보호.
 */
type BulkDisenchantRow = {
  catalogItemId: number;
  code: string;
  name: string;
  slot: Slot;
  toDisenchantIds: bigint[];
  count: number;
  diamondGranted: number;
};
type BulkDisenchantPlan = {
  rows: BulkDisenchantRow[];
  totalCount: number;
  totalDiamond: number;
};

async function planBulkDisenchant(userId: string): Promise<BulkDisenchantPlan> {
  const equips = (await db
    .select({
      id: equipmentInstances.id,
      catalogItemId: equipmentInstances.catalogItemId,
      transcendLevel: equipmentInstances.transcendLevel,
      enhanceLevel: equipmentInstances.enhanceLevel,
      isLocked: equipmentInstances.isLocked,
      equippedSlot: equipmentInstances.equippedSlot,
      code: catalogItems.code,
      name: catalogItems.name,
      slot: catalogItems.slot,
    })
    .from(equipmentInstances)
    .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
    .where(eq(equipmentInstances.userId, userId))) as unknown as Array<{
    id: bigint;
    catalogItemId: number;
    transcendLevel: number;
    enhanceLevel: number;
    isLocked: boolean;
    equippedSlot: string | null;
    code: string;
    name: string;
    slot: Slot;
  }>;

  const equipIds = equips.map((e) => BigInt(e.id));
  const busySet = new Set<string>();
  if (equipIds.length > 0) {
    const rows = await db
      .select({
        eq: enhancementJobs.equipmentInstanceId,
        fo: enhancementJobs.fodderInstanceId,
      })
      .from(enhancementJobs)
      .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.status, 'running')));
    for (const r of rows) {
      if (r.eq != null) busySet.add(String(r.eq));
      if (r.fo != null) busySet.add(String(r.fo));
    }
  }

  const groups = new Map<number, typeof equips>();
  for (const e of equips) {
    if (!groups.has(e.catalogItemId)) groups.set(e.catalogItemId, []);
    groups.get(e.catalogItemId)!.push(e);
  }

  const planRows: BulkDisenchantRow[] = [];
  for (const [catalogItemId, list] of groups) {
    // 일괄 분해 적격: 강화 0 + 초월 0 + 미장착 + 미잠금 + 강화중·예약 아님(2026-05-31 정책).
    // 가공 흔적이 있는 인스턴스는 잠금 없이도 자동 보호 — 별도 '가장 강한 1개 보존' 없음.
    const candidates = list.filter(
      (f) =>
        !f.isLocked &&
        f.equippedSlot == null &&
        !busySet.has(String(f.id)) &&
        f.enhanceLevel === 0 &&
        f.transcendLevel === 0,
    );
    if (candidates.length === 0) continue;
    const rep = candidates[0]!;
    planRows.push({
      catalogItemId,
      code: rep.code,
      name: rep.name,
      slot: rep.slot,
      toDisenchantIds: candidates.map((c) => BigInt(c.id)),
      count: candidates.length,
      diamondGranted: candidates.length * DIAMOND_PER_DISENCHANT,
    });
  }
  // 표시 순서 — 분해 개수 큰 순, 그 다음 이름.
  planRows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
  const totalCount = planRows.reduce((a, r) => a + r.count, 0);
  return { rows: planRows, totalCount, totalDiamond: totalCount * DIAMOND_PER_DISENCHANT };
}

export async function previewBulkDisenchantAction() {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  const plan = await planBulkDisenchant(u);
  return {
    status: 'success' as const,
    rows: plan.rows.map((r) => ({
      catalogItemId: r.catalogItemId,
      code: r.code,
      name: r.name,
      slot: r.slot,
      toDisenchantIds: r.toDisenchantIds.map((i) => i.toString()),
      count: r.count,
      diamondGranted: r.diamondGranted,
    })),
    totalCount: plan.totalCount,
    totalDiamond: plan.totalDiamond,
  };
}

/** 선택한 카탈로그 그룹의 모든 적격 인스턴스를 일괄 분해. */
export async function bulkDisenchantAction(catalogItemIds?: number[]) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');

  const ranksBefore = await getMyRanks(u);
  const plan = await planBulkDisenchant(u);
  const selected =
    catalogItemIds && catalogItemIds.length > 0
      ? plan.rows.filter((r) => catalogItemIds.includes(r.catalogItemId))
      : plan.rows;
  const allIds = selected.flatMap((r) => r.toDisenchantIds);
  const r = await disenchant({ userId: u, equipmentInstanceIds: allIds });
  const ranksAfter = await getMyRanksAfter(u);
  revalidate();
  return {
    status: 'success' as const,
    disenchanted: r.disenchanted,
    diamondGranted: r.diamondGranted,
    groups: selected.map((s) => ({ name: s.name, count: s.count, diamondGranted: s.diamondGranted })),
    ranksBefore,
    ranksAfter,
  };
}
