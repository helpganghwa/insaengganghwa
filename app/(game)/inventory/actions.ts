'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { equipItem, unequipItem, EquipError } from '@/lib/game/equipment/equip';

/**
 * 인벤토리 액션 — 장착 전용(외형, 전투력·랭킹 무관 BALANCE §3.2).
 * 초월은 자동(박스 열기 시), 분해·잠금은 폐기 → 별도 액션 없음.
 */
type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  NOT_FOUND: '장비를 찾을 수 없습니다.',
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
