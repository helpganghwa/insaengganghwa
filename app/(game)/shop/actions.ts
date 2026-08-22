'use server';

import { revalidatePath } from 'next/cache';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { getSessionUserId, shouldHidePaidContent } from '@/lib/auth/session';
import { getAdminStatus } from '@/lib/auth/require-admin';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { claimFree, ShopFreeError, type FreeSlot } from '@/lib/game/shop/free';
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
 * 실결제 주문 생성 — 포트원 결제창을 띄우기 직전 호출. 금액·지급량은 서버 카탈로그 권위.
 * 반환값(paymentId·금액·storeId·channelKey)으로 클라가 PortOne.requestPayment 호출.
 */
export async function createOrderAction(productId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (await rateLimited(u, 'shop')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  // CBT 기간 결제 차단(서버 권위) — UI 숨김 우회 방지. 테스터·정식 출시 시엔 통과.
  // 어드민은 통과 — 상점 UI가 어드민에게만 열려 있고(shop/page.tsx), 출시 전 실결제 검수 경로가
  // 이것뿐이다(어드민 즉시구매 폐지). 코드는 CONFIG가 아니라 PAY_CLOSED —
  // 채널 미설정과 CBT 차단은 원인이 달라 같은 안내를 쓰면 진단이 통째로 어긋난다.
  if (await shouldHidePaidContent()) {
    const { isAdmin } = await getAdminStatus();
    if (!isAdmin) return { status: 'error', code: 'PAY_CLOSED' } as const;
  }
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
    revalidatePath('/battlepass'); // 성장패스 결제도 이 액션 경유 — 클라 refresh 제거(2026-08-20) 커버
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

/**
 * 복귀 정산 조회(2026-08-22) — PWA(홈 화면 앱)에선 결제·인증창이 외부 브라우저 탭에서 열려
 * 리다이렉트 파라미터가 앱 컨텍스트로 돌아오지 않는다(지급은 웹훅이 처리해 잔액만 바뀜).
 * 복귀(visibilitychange) 시 이 액션으로 최근 15분 내 결과를 조회해 결과 팝업을 띄운다.
 * 클라는 localStorage ack(paymentId/verifiedAt)로 중복 표시를 막는다.
 */
export async function recentPayResultAction(): Promise<{
  paid: { paymentId: string; productCode: string; paidAtIso: string } | null;
  verifiedAtIso: string | null;
}> {
  const u = await getSessionUserId();
  if (!u) return { paid: null, verifiedAtIso: null };
  const [rows, prof] = await Promise.all([
    db.execute(sql`
      select portone_order_id as payment_id, product_code, paid_at from iap_orders
      where user_id = ${u}::uuid and status = 'paid' and paid_at > now() - interval '15 minutes'
      order by paid_at desc limit 1
    `) as unknown as Promise<{ payment_id: string; product_code: string; paid_at: Date }[]>,
    db.execute(sql`
      select identity_verified_at from profiles
      where id = ${u}::uuid and identity_verified_at > now() - interval '15 minutes'
    `) as unknown as Promise<{ identity_verified_at: Date }[]>,
  ]);
  const paid = rows[0]
    ? { paymentId: rows[0].payment_id, productCode: rows[0].product_code, paidAtIso: new Date(rows[0].paid_at).toISOString() }
    : null;
  const verifiedAtIso = prof[0] ? new Date(prof[0].identity_verified_at).toISOString() : null;
  return { paid, verifiedAtIso };
}
