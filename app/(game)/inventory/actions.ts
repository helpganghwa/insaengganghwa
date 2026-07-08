'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr } from '@/lib/game/action-result';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { equipItem, unequipItem, EquipError } from '@/lib/game/equipment/equip';

/**
 * 인벤토리 액션 — 장착 전용(외형, 전투력·랭킹 무관 BALANCE §3.2).
 * 초월은 자동(박스 열기 시), 분해·잠금은 폐기 → 별도 액션 없음.
 */

const MSG: Record<string, string> = {
  NOT_FOUND: '장비를 찾을 수 없습니다.',
  SLOT_TAKEN: '같은 부위를 방금 다른 곳에서 장착했어요. 다시 시도해 주세요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  UNKNOWN: '알 수 없는 오류',
};
const err = makeErr(MSG);

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
  const __b = await actionBlock();
  if (__b) return err(__b);
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
  const __b = await actionBlock();
  if (__b) return err(__b);
  try {
    await unequipItem(u, BigInt(id));
    revalidate();
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EquipError) return err(e.code);
    console.error('[unequip]', e);
    return err('UNKNOWN');
  }
}
