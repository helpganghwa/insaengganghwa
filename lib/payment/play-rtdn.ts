import 'server-only';

import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { raisePaymentAlert } from './alert';
import { getPlayProductPurchase } from './play-api';
import { isKnownPlaySku } from './play-sku';
import { completePurchase } from './purchase';

/**
 * 구글 실시간 개발자 알림(RTDN) 처리(2026-09-24) — docs/PLAYSTORE.md.
 *
 * 왜: 결제 결과가 브라우저 화면을 거쳐야만 서버에 오던 구조라, 결제 중 화면이 새로 열리면(웨일 호스트 재로딩 등)
 * 구글은 청구했는데 서버는 모르는 건이 생겼다(9/24 00:24 ₩68,000). RTDN은 구글이 서버로 구매 토큰을 직접 보낸다.
 *
 * 규칙: ① 토큰이 이미 주문에 묶였으면 그 주문만(미완이면 마무리) ② 아니면 같은 SKU·토큰 없는 미완(pending·expired)
 * 주문 중 **마지막 결제 시도 시각(play_checkout_at, 0215)** 이 구매 시각 [-15분, +2분]에 있는 것 — **정확히 1건일 때만**
 * 지급(completePurchase: 구글 재검증·지급·소모, 멱등). createPlayOrder가 주문을 만들거나 재사용할 때마다 이 시각을 찍으므로
 * 우리 결제창을 거친 구매자 본인의 주문은 (만료됐어도) 반드시 후보에 들어간다 → 후보 1건이면 본인 주문이다.
 * 0건·여러 건이면 지급하지 않고 경보. 우리 결제창을 거치지 않았을 수 있는 구매(테스트·프로모·리워드, purchaseType 0·1·2)는
 * 본인 주문이 후보에 없을 수 있어 자동 지급하지 않는다(감사 A1: 남의 방치 주문 1건에 지급되는 경로 차단).
 */
export const RTDN_MATCH_BEFORE_MS = 15 * 60_000;
export const RTDN_MATCH_AFTER_MS = 2 * 60_000;

export type RtdnOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'already'; paymentId: string }
  | { kind: 'granted'; paymentId: string; already: boolean }
  | { kind: 'unmatched'; candidates: number }
  | { kind: 'failed'; paymentId: string; code: string }
  | { kind: 'minor_limit'; paymentId: string };

/** 후보 고르기(순수) — 결제 시도 시각이 창 안인 주문이 정확히 1건일 때만 그 주문. */
export function pickRtdnCandidate<T extends { checkoutAt: Date | null }>(rows: T[], purchaseTimeMs: number): T | null {
  const inWindow = rows.filter((r) => {
    if (!r.checkoutAt) return false;
    const t = r.checkoutAt.getTime();
    return t >= purchaseTimeMs - RTDN_MATCH_BEFORE_MS && t <= purchaseTimeMs + RTDN_MATCH_AFTER_MS;
  });
  return inWindow.length === 1 ? inWindow[0]! : null;
}

export async function handleOneTimePurchase(sku: string, purchaseToken: string): Promise<RtdnOutcome> {
  if (!isKnownPlaySku(sku)) {
    await raisePaymentAlert('PLAY_RTDN_UNMATCHED', {
      paymentId: `rtdn:sku:${sku}:${purchaseToken.slice(0, 12)}`,
      detail: `알 수 없는 SKU(${sku})의 구매 알림 — 콘솔에서 확인.`,
    });
    return { kind: 'ignored', reason: `unknown sku ${sku}` };
  }
  const g = await getPlayProductPurchase(sku, purchaseToken);
  if (g.purchaseState !== 0) return { kind: 'ignored', reason: `purchaseState ${g.purchaseState}` };
  // 테스트(0)·프로모(1)·리워드(2) — 우리 결제창을 거치지 않았을 수 있어 본인 주문이 후보에 없을 수 있다.
  const notOurCheckout = g.purchaseType === 0 || g.purchaseType === 1 || g.purchaseType === 2;
  const purchaseTimeMs = Number(g.purchaseTimeMillis ?? Date.now());

  const [bound] = await db
    .select({ paymentId: iapOrders.portoneOrderId, userId: iapOrders.userId, status: iapOrders.status })
    .from(iapOrders)
    .where(eq(iapOrders.playPurchaseToken, purchaseToken))
    .limit(1);
  if (bound) {
    if (bound.status !== 'pending' && bound.status !== 'expired') return { kind: 'already', paymentId: bound.paymentId };
    return finish(bound.paymentId, bound.userId, purchaseToken, g.orderId);
  }

  const rows = await db
    .select({ paymentId: iapOrders.portoneOrderId, userId: iapOrders.userId, checkoutAt: iapOrders.playCheckoutAt })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.playSku, sku),
        inArray(iapOrders.status, ['pending', 'expired']),
        isNull(iapOrders.playPurchaseToken),
        gte(iapOrders.playCheckoutAt, new Date(purchaseTimeMs - RTDN_MATCH_BEFORE_MS)),
        lte(iapOrders.playCheckoutAt, new Date(purchaseTimeMs + RTDN_MATCH_AFTER_MS)),
      ),
    );
  const pick = notOurCheckout ? null : pickRtdnCandidate(rows, purchaseTimeMs);
  if (!pick) {
    await raisePaymentAlert('PLAY_RTDN_UNMATCHED', {
      paymentId: `rtdn:${g.orderId ?? purchaseToken.slice(0, 16)}`,
      detail: `구글 주문 ${g.orderId ?? '?'}(${sku}${notOurCheckout ? `, purchaseType ${g.purchaseType}` : ''}) — 같은 상품의 미완 주문 ${rows.length}건(${rows.map((r) => r.paymentId).join(', ') || '없음'}). Play Console에서 확인 뒤 /api/admin/play-complete-order로 지급.`,
    });
    return { kind: 'unmatched', candidates: rows.length };
  }
  return finish(pick.paymentId, pick.userId, purchaseToken, g.orderId);
}

async function finish(paymentId: string, userId: string, token: string, googleOrderId?: string): Promise<RtdnOutcome> {
  const r = await completePurchase(paymentId, userId, { playPurchaseToken: token });
  if (r.ok) return { kind: 'granted', paymentId, already: r.already };
  // 미성년 한도 초과는 completePurchase가 자동 환불·경보(MINOR_LIMIT_EXCEEDED)까지 한다 — 지급 실패로 중복 경보하지 않는다.
  if (r.code === 'MINOR_LIMIT') return { kind: 'minor_limit', paymentId };
  await raisePaymentAlert('PLAY_RTDN_FAILED', {
    paymentId,
    detail: `RTDN 지급 실패 ${r.code} — 구글 주문 ${googleOrderId ?? '?'}`,
  });
  return { kind: 'failed', paymentId, code: r.code };
}
