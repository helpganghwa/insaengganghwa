'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
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
  await unequipItem(u, BigInt(id));
  revalidate();
  return { status: 'success' as const };
}

export async function toggleLockAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
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
  const { slotsUpdated } = await equipBestSet(u);
  revalidate();
  return { status: 'success' as const, slotsUpdated };
}

/** 초월 — 같은 카탈로그 아이템 제물 소모, 즉시·무RNG (GDD §3.3). */
export async function transcendAction(id: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
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
  const r = await disenchant({ userId: u, equipmentInstanceIds: [BigInt(id)] });
  if (r.disenchanted === 0) return err('NOT_FOUND');
  revalidate();
  return { status: 'success' as const, diamondGranted: r.diamondGranted };
}
