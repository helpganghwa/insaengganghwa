'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { claimFree, ShopFreeError, type FreeSlot } from '@/lib/game/shop/free';

/** 상점 무료 수령 — 결제 불필요. 주기 멱등(서버). */
export async function claimFreeAction(slot: FreeSlot) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    const r = await claimFree(u, slot);
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', diamond: r.diamond, boxes: r.boxes } as const;
  } catch (e) {
    if (e instanceof ShopFreeError) return { status: 'error', code: e.code } as const;
    console.error('[shop.claimFree]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}
