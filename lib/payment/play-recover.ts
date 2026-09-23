import 'server-only';

import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { getPlayProductPurchase, PlayApiError } from './play-api';
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
  /**
   * CANCELLED = 구글이 취소·환불됐다고 답한 구매(지급 없음, 클라가 기기 consume으로 잠김만 푼다).
   * PENDING = 구글 쪽 결제 보류(편의점 결제 등) — 손대지 않는다. NOT_FOUND = 그 SKU의 구매가 아님.
   */
  | { ok: false; code: 'UNKNOWN_SKU' | 'NO_ORDER' | 'CANCELLED' | 'PENDING' | 'NOT_FOUND' | CompleteFailCode };

const LOOKBACK_DAYS = 7;

export async function recoverPlayPurchase(
  userId: string,
  serverId: number,
  sku: string,
  purchaseToken: string,
): Promise<RecoverResult> {
  if (!isKnownPlaySku(sku)) return { ok: false, code: 'UNKNOWN_SKU' };

  // 구글 권위부터 — 상태에 따라 갈린다. 보류(2)는 손대지 않고, 취소(1)는 지급 없이 잠김만 풀게 한다.
  // 다른 SKU의 토큰이면 조회 경로가 404(PlayApiError)로 던진다.
  let state: number;
  try {
    state = (await getPlayProductPurchase(sku, purchaseToken)).purchaseState;
  } catch (e) {
    if (e instanceof PlayApiError && (e.status === 404 || e.status === 400)) return { ok: false, code: 'NOT_FOUND' };
    throw e;
  }
  // 보류(2)는 손대지 않는다 — 대개 화면의 첫 검증이 토큰을 주문에 묶어 두었고, 아니어도 결제가 끝나면 완료 알림(RTDN)·다음 복구가 지급한다.
  // ⚠ 이 줄이 없으면 아래 'state !== 0 → CANCELLED'가 보류까지 잡아 기기가 보류 중인 구매를 소모해 버린다(2026-09-24 검수에서 발각).
  if (state === 2) return { ok: false, code: 'PENDING' };
  if (state !== 0) return { ok: false, code: 'CANCELLED' };

  // ① 토큰이 이미 묶인 주문(본인 것만) — 미완 주문만 다시 시도. paid·refunded 등 끝난 주문은 손대지 않는다
  //   (completePurchase는 전이가 없어도 ok를 돌려주므로 여기서 걸러야 "반영됐어요"가 헛뜨지 않는다).
  const [bound] = await db
    .select({ paymentId: iapOrders.portoneOrderId, status: iapOrders.status })
    .from(iapOrders)
    .where(and(eq(iapOrders.userId, userId), eq(iapOrders.playPurchaseToken, purchaseToken)))
    .limit(1);
  if (bound) {
    if (bound.status === 'pending' || bound.status === 'expired') return finish(bound.paymentId, userId, purchaseToken);
    return { ok: true, already: true, paymentId: bound.paymentId };
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
        // 다른 토큰이 이미 묶인 주문(보류 선결합)은 제외 — 덮어쓰면 그 보류 결제가 주인을 잃는다(재검증 B-1).
        isNull(iapOrders.playPurchaseToken),
        inArray(iapOrders.status, ['pending', 'expired']),
        gte(iapOrders.createdAt, sql`now() - interval '${sql.raw(String(LOOKBACK_DAYS))} days'`),
      ),
    )
    // 마지막 결제 시도 순(0215) — 성장패스처럼 가격 SKU를 공유하면 가장 최근에 결제창을 연 주문이 이 구매다.
    .orderBy(desc(sql`coalesce(${iapOrders.playCheckoutAt}, ${iapOrders.createdAt})`))
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
