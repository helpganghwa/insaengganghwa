'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { requireAdmin } from '@/lib/auth/require-admin';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { claimFree, ShopFreeError, type FreeSlot } from '@/lib/game/shop/free';
import { devPurchase } from '@/lib/game/shop/dev-purchase';
import { buyBox, BuyBoxError } from '@/lib/game/shop/buy-box';
import { createOrder, completePurchase, PurchaseError } from '@/lib/payment/purchase';

/** 상점 무료 수령 — 결제 불필요. 주기 멱등(서버). */
export async function claimFreeAction(slot: FreeSlot) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
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

/**
 * 실결제 주문 생성 — 포트원 결제창을 띄우기 직전 호출. 금액·지급량은 서버 카탈로그 권위.
 * 반환값(paymentId·금액·storeId·channelKey)으로 클라가 PortOne.requestPayment 호출.
 */
export async function createOrderAction(productId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const o = await createOrder(u, await getActiveServerId(), productId);
    return { status: 'success', order: o } as const;
  } catch (e) {
    if (e instanceof PurchaseError) return { status: 'error', code: e.code } as const;
    console.error('[shop.createOrder]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

/**
 * 결제 완료 검증·지급 — 클라 결제창이 성공 콜백을 준 직후 호출(웹훅과 멱등 이중 안전망).
 * 실제 지급은 포트원 서버에서 PAID·금액 재확인한 경우에만. 이미 지급됐으면 already로 무해.
 */
export async function verifyPurchaseAction(paymentId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  try {
    // 세션 userId 전달 → 내 주문만 검증(감사 F1-pay). 웹훅·recon·admin은 서버 권위라 미전달.
    const r = await completePurchase(paymentId, u);
    if (!r.ok) return { status: 'error', code: r.code } as const;
    revalidatePath('/shop');
    revalidatePath('/');
    return { status: 'success', already: r.already } as const;
  } catch (e) {
    console.error('[shop.verifyPurchase]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

/** 💎로 보급상자 구매(견습의 주머니) — 결제 불필요·전 유저. 기간 1회 제한 + 💎 차감. */
export async function buyBoxAction(productId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
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
