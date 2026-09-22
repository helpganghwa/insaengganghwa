import 'server-only';

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { isKnownPlaySku, productIdForPlaySku } from './play-sku';
import { completePurchase, createPlayOrder, PurchaseError, type CompleteResult } from './purchase';

/**
 * Play 결제 복구(2026-09-22) — 구글에는 구매가 살아 있는데 우리 서버가 지급하지 못한 건을 되살린다.
 *
 * 생긴 일: 서비스 계정 401로 검증이 실패하자 클라가 시트를 fail로 닫았고, 토큰은 저장되지 않았다.
 * 구글은 소모(확인)되지 않은 소모성 구매를 "already own"으로 막아 같은 상품을 다시 살 수도 없고,
 * 3일 뒤 자동 환불이 유일한 구제였다. 앱이 상점을 열 때 기기의 Digital Goods `listPurchases()`가
 * 돌려주는 (sku, token)을 여기로 보내면 다시 검증·지급·소모한다(completePurchase, 멱등).
 *
 * 주문 매칭 순서: ① 같은 토큰이 이미 묶인 주문 → ② 같은 SKU의 최근 7일 pending/expired 주문(최신) →
 * ③ 없으면 SKU로 상품을 알 수 있을 때만 새 주문(성장패스 구간은 가격 SKU를 공유해 못 만든다 → NO_ORDER).
 */
type CompleteFailCode = Extract<CompleteResult, { ok: false }>['code'];
export type RecoverResult =
  | { ok: true; already: boolean; paymentId: string }
  | { ok: false; code: 'UNKNOWN_SKU' | 'NO_ORDER' | CompleteFailCode };

const LOOKBACK_DAYS = 7;

export async function recoverPlayPurchase(
  userId: string,
  serverId: number,
  sku: string,
  purchaseToken: string,
): Promise<RecoverResult> {
  if (!isKnownPlaySku(sku)) return { ok: false, code: 'UNKNOWN_SKU' };

  // ① 토큰이 이미 묶인 주문(본인 것만) — paid면 already, 아니면 그 주문으로 재시도.
  const [bound] = await db
    .select({ paymentId: iapOrders.portoneOrderId, status: iapOrders.status })
    .from(iapOrders)
    .where(and(eq(iapOrders.userId, userId), eq(iapOrders.playPurchaseToken, purchaseToken)))
    .limit(1);
  if (bound) {
    if (bound.status === 'paid') return { ok: true, already: true, paymentId: bound.paymentId };
    return finish(bound.paymentId, userId, purchaseToken);
  }

  // ② 같은 SKU의 최근 미완 주문(최신부터).
  const [pending] = await db
    .select({ paymentId: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.userId, userId),
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.playSku, sku),
        inArray(iapOrders.status, ['pending', 'expired']),
        gte(iapOrders.createdAt, sql`now() - interval '${sql.raw(String(LOOKBACK_DAYS))} days'`),
      ),
    )
    .orderBy(desc(iapOrders.createdAt))
    .limit(1);
  if (pending) return finish(pending.paymentId, userId, purchaseToken);

  // ③ 주문이 없으면 SKU로 상품을 되돌릴 수 있을 때만 새 주문.
  const productId = productIdForPlaySku(sku);
  if (!productId) return { ok: false, code: 'NO_ORDER' };
  try {
    const o = await createPlayOrder(userId, serverId, productId);
    return finish(o.paymentId, userId, purchaseToken);
  } catch (e) {
    if (e instanceof PurchaseError) return { ok: false, code: 'NO_ORDER' };
    throw e;
  }
}

async function finish(paymentId: string, userId: string, token: string): Promise<RecoverResult> {
  const r = await completePurchase(paymentId, userId, { playPurchaseToken: token });
  if (r.ok) return { ok: true, already: r.already, paymentId };
  return { ok: false, code: r.code };
}
