import 'server-only';

import { and, eq, gte, isNull, lte } from 'drizzle-orm';

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
 * 규칙: ① 토큰이 이미 주문에 묶였으면 그 주문만(미완이면 마무리) ② 아니면 같은 SKU·토큰 없는 pending 주문 중
 * 구매 시각 기준 [-6시간 10분, +2분]에 만들어진 것 — **정확히 1건일 때만** 지급(completePurchase: 구글 재검증·지급·소모,
 * 멱등). 창이 6시간인 이유: createPlayOrder가 같은 상품의 pending을 6시간 안에서 재사용하며 생성 시각을 바꾸지 않는다.
 * 구매자 본인의 주문은 우리 결제 흐름에서 항상 결제 전에 만들어져 후보에 들어가므로, 후보가 1건이면 그것이 본인 주문이다.
 * 0건·여러 건이면 지급하지 않고 경보(다른 유저 주문에 잘못 지급하지 않기 위해). 프로모 코드·리워드(purchaseType 1·2)는
 * 우리 주문 없이 생길 수 있어 자동 지급하지 않는다.
 * 화면 경로와 동시에 와도 같은 주문·같은 토큰이라 FOR UPDATE + paid 가드로 1회만 지급된다.
 */
export const RTDN_MATCH_BEFORE_MS = (6 * 60 + 10) * 60_000;
export const RTDN_MATCH_AFTER_MS = 2 * 60_000;

export type RtdnOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'already'; paymentId: string }
  | { kind: 'granted'; paymentId: string; already: boolean }
  | { kind: 'unmatched'; candidates: number }
  | { kind: 'failed'; paymentId: string; code: string };

/** 후보 고르기(순수) — 정확히 1건일 때만 그 주문. */
export function pickRtdnCandidate<T extends { createdAt: Date }>(rows: T[], purchaseTimeMs: number): T | null {
  const inWindow = rows.filter((r) => {
    const t = r.createdAt.getTime();
    return t >= purchaseTimeMs - RTDN_MATCH_BEFORE_MS && t <= purchaseTimeMs + RTDN_MATCH_AFTER_MS;
  });
  return inWindow.length === 1 ? inWindow[0]! : null;
}

export async function handleOneTimePurchase(sku: string, purchaseToken: string): Promise<RtdnOutcome> {
  if (!isKnownPlaySku(sku)) return { kind: 'ignored', reason: `unknown sku ${sku}` };
  const g = await getPlayProductPurchase(sku, purchaseToken);
  if (g.purchaseState !== 0) return { kind: 'ignored', reason: `purchaseState ${g.purchaseState}` };
  const notOurCheckout = g.purchaseType === 1 || g.purchaseType === 2; // 프로모·리워드 — 우리 결제창을 거치지 않았을 수 있다
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
    .select({ paymentId: iapOrders.portoneOrderId, userId: iapOrders.userId, createdAt: iapOrders.createdAt })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.playSku, sku),
        eq(iapOrders.status, 'pending'),
        isNull(iapOrders.playPurchaseToken),
        gte(iapOrders.createdAt, new Date(purchaseTimeMs - RTDN_MATCH_BEFORE_MS)),
        lte(iapOrders.createdAt, new Date(purchaseTimeMs + RTDN_MATCH_AFTER_MS)),
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
  await raisePaymentAlert('PLAY_RTDN_FAILED', {
    paymentId,
    detail: `RTDN 지급 실패 ${r.code} — 구글 주문 ${googleOrderId ?? '?'}`,
  });
  return { kind: 'failed', paymentId, code: r.code };
}
