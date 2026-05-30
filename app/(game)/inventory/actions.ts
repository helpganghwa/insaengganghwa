'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { equipmentInstances } from '@/lib/db/schema/equipment';
import { equipItem, unequipItem, toggleEquipmentLock, equipBestSet, EquipError } from '@/lib/game/equipment/equip';
import { performTranscend, TranscendError } from '@/lib/game/transcend';
import { disenchant } from '@/lib/game/supply';

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
    await equipItem(u, BigInt(id));
    revalidate();
    return { status: 'success' as const };
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
  await unequipItem(u, BigInt(id));
  revalidate();
  return { status: 'success' as const };
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
  const { slotsUpdated } = await equipBestSet(u);
  revalidate();
  return { status: 'success' as const, slotsUpdated };
}

/**
 * 일괄 초월 — 보유 장비 전체를 한 번씩 순회하며 performTranscend 시도.
 * 실패 사유(EQUIPMENT_LOCKED·INSUFFICIENT_FODDER·그 외)는 카운트만 집계, 전체 진행 계속.
 * 트랜잭션은 performTranscend가 각자 보유 — 한 건 실패가 다른 건에 영향 X.
 *
 * "한 번씩" 정책: 사용자 1회 클릭 = 각 장비 1단계만 시도. 누적 초월은 재호출.
 *
 * 우선순위: 가장 낮은 transcend_level 먼저(= 적은 제물부터 → 단일 통과로 최대 성공률).
 */
export async function bulkTranscendAction() {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');

  // 후보 — 본인 보유 + 미잠금 + 강화 중 아님(잠금/강화중은 performTranscend 자체가 가능,
  // 단 단순 BUSY로 분류해 사용자에 명확 표시하기 위해 액션 단에서 사전 분류).
  const rows = (await db
    .select({
      id: equipmentInstances.id,
      transcendLevel: equipmentInstances.transcendLevel,
      isLocked: equipmentInstances.isLocked,
    })
    .from(equipmentInstances)
    .where(eq(equipmentInstances.userId, u))
    .orderBy(equipmentInstances.transcendLevel)) as unknown as Array<{
    id: bigint;
    transcendLevel: number;
    isLocked: boolean;
  }>;

  let success = 0;
  let skippedFodder = 0;
  let skippedBusy = 0;
  let skippedMax = 0; // 무한 초월이라 실질 미사용(향후 cap 도입 대비).

  for (const r of rows) {
    if (r.isLocked) {
      skippedBusy++;
      continue;
    }
    try {
      await performTranscend({ userId: u, equipmentInstanceId: BigInt(r.id) });
      success++;
    } catch (e) {
      if (e instanceof TranscendError) {
        if (e.code === 'INSUFFICIENT_FODDER') skippedFodder++;
        else if (e.code === 'TRANSCEND_MAX') skippedMax++;
        else skippedBusy++;
      } else {
        console.error('[bulk-transcend]', e);
        skippedBusy++;
      }
    }
  }

  revalidate();
  return {
    status: 'success' as const,
    total: rows.length,
    success,
    skippedFodder,
    skippedBusy,
    skippedMax,
  };
}

/** 초월 — 같은 카탈로그 아이템 제물 소모, 즉시·무RNG (GDD §3.3). */
export async function transcendAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'inventory')) return err('RATE_LIMITED');
  try {
    const r = await performTranscend({ userId: u, equipmentInstanceId: BigInt(id) });
    revalidate();
    return { status: 'success' as const, fromT: r.fromT, toT: r.toT, fodder: r.fodderConsumed };
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
