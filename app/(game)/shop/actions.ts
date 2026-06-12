'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { requireAdmin } from '@/lib/auth/require-admin';
import { claimFree, ShopFreeError, type FreeSlot } from '@/lib/game/shop/free';
import { devPurchase } from '@/lib/game/shop/dev-purchase';
import { buyBox, BuyBoxError } from '@/lib/game/shop/buy-box';

/** 상점 무료 수령 — 결제 불필요. 주기 멱등(서버). */
export async function claimFreeAction(slot: FreeSlot) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    const r = await claimFree(u, await getActiveServerId(), slot);
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', diamond: r.diamond, boxes: r.boxes } as const;
  } catch (e) {
    if (e instanceof ShopFreeError) return { status: 'error', code: e.code } as const;
    console.error('[shop.claimFree]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

/**
 * 어드민 테스트 즉시 구매 — 결제 백엔드 연동 전, 현금 상품을 결제 없이 바로 지급.
 * requireAdmin 가드(비-어드민은 FORBIDDEN). 결제 연동 후 실제 결제 흐름으로 대체 예정.
 */
export async function devPurchaseAction(productId: string) {
  try {
    const u = await requireAdmin();
    const g = await devPurchase(u, await getActiveServerId(), productId);
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', diamond: g.diamond, boxes: g.boxes } as const;
  } catch (e) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    return { status: 'error', code } as const;
  }
}

/** 💎로 보급상자 구매(견습의 주머니) — 결제 불필요·전 유저. 기간 1회 제한 + 💎 차감. */
export async function buyBoxAction(productId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    const g = await buyBox(u, await getActiveServerId(), productId);
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', cost: g.cost, boxes: g.boxes } as const;
  } catch (e) {
    if (e instanceof BuyBoxError) return { status: 'error', code: e.code } as const;
    console.error('[shop.buyBox]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}
