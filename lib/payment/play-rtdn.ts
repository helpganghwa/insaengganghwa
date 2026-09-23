import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';

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
 * 원칙 — **확실할 때만 자동 지급, 조금이라도 애매하면 경보(수동)**. 구매와 우리 유저를 잇는 값이 없어서, 추정이 틀리면
 * 남에게 지급되고 구매자는 소모된 채 영구 미지급이 된다(감사 3회에서 매번 새 경로가 나왔다). 그래서:
 *  ⓪ 구매 후 3분(RTDN_GRACE_MS)은 처리하지 않는다(재전송 대기) — 정상 경로(화면 검증·상점 복구)가 먼저 토큰을 묶게 해,
 *     자동 매칭은 정말로 결과가 사라진 건에만 쓰인다.
 *  ① 토큰이 이미 주문에 묶였으면 그 주문만(미완이면 마무리).
 *  ② 아니면 같은 SKU의 Play 주문을 **상태·토큰·유저와 무관하게** 구매 시각 기준 [-6시간 10분, 지금] 범위
 *     (마지막 결제 시도 시각 = coalesce(play_checkout_at, created_at))에서 센다. **정확히 1건이고 그것이 토큰 없는
 *     미완(pending·expired)일 때만** 지급한다. 6시간은 createPlayOrder의 재사용 창이다 — 본인 주문은 이 범위 안에 반드시
 *     있으므로(재사용·오래 열린 결제창·같은 주문의 두 번째 구매 포함), 다른 주문이 하나라도 있으면 애매함으로 빠진다.
 *  ③ 테스트·프로모·리워드(purchaseType 0·1·2)는 우리 결제창을 거치지 않았을 수 있어 자동 지급하지 않는다.
 */
export const RTDN_LOOKBACK_MS = (6 * 60 + 10) * 60_000;
export const RTDN_GRACE_MS = 3 * 60_000;

/** 아직 처리할 때가 아님 — 라우트가 500으로 답해 Pub/Sub가 재전송하게 한다. */
export class RtdnRetryLater extends Error {}

export type RtdnOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'already'; paymentId: string }
  | { kind: 'granted'; paymentId: string; already: boolean }
  | { kind: 'unmatched'; candidates: number }
  | { kind: 'failed'; paymentId: string; code: string }
  | { kind: 'minor_limit'; paymentId: string };

type Row = { paymentId: string; userId: string; status: string; hasToken: boolean };

/** 후보 판정(순수) — 범위 안 같은 SKU 주문이 정확히 1건이고 그것이 토큰 없는 미완일 때만 그 주문. */
export function pickRtdnCandidate<T extends Row>(rows: T[]): T | null {
  if (rows.length !== 1) return null;
  const r = rows[0]!;
  return !r.hasToken && (r.status === 'pending' || r.status === 'expired') ? r : null;
}

export async function handleOneTimePurchase(sku: string, purchaseToken: string, now = Date.now()): Promise<RtdnOutcome> {
  if (!isKnownPlaySku(sku)) {
    await raisePaymentAlert('PLAY_RTDN_UNMATCHED', {
      paymentId: `rtdn:sku:${sku}:${purchaseToken.slice(0, 12)}`,
      detail: `알 수 없는 SKU(${sku})의 구매 알림 — 콘솔에서 확인.`,
    });
    return { kind: 'ignored', reason: `unknown sku ${sku}` };
  }
  const g = await getPlayProductPurchase(sku, purchaseToken);
  if (g.purchaseState !== 0) return { kind: 'ignored', reason: `purchaseState ${g.purchaseState}` };
  // 구매 시각이 없으면 대기 판정이 매번 '방금'이 되어 영원히 재전송된다(재검증 B-5) — 자동 지급하지 않고 경보.
  if (!g.purchaseTimeMillis) {
    const [b] = await db.select({ paymentId: iapOrders.portoneOrderId, userId: iapOrders.userId, status: iapOrders.status }).from(iapOrders).where(eq(iapOrders.playPurchaseToken, purchaseToken)).limit(1);
    if (b) return b.status === 'pending' || b.status === 'expired' ? finish(b.paymentId, b.userId, purchaseToken, g.orderId) : { kind: 'already', paymentId: b.paymentId };
    await raisePaymentAlert('PLAY_RTDN_UNMATCHED', { paymentId: `rtdn:${g.orderId ?? purchaseToken.slice(0, 16)}`, detail: `구매 시각 없는 구매 알림(${sku}, ${g.orderId ?? '?'}) — 자동 지급하지 않음. 콘솔에서 확인.` });
    return { kind: 'unmatched', candidates: 0 };
  }
  const purchaseTimeMs = Number(g.purchaseTimeMillis);

  const [bound] = await db
    .select({ paymentId: iapOrders.portoneOrderId, userId: iapOrders.userId, status: iapOrders.status })
    .from(iapOrders)
    .where(eq(iapOrders.playPurchaseToken, purchaseToken))
    .limit(1);
  if (bound) {
    if (bound.status !== 'pending' && bound.status !== 'expired') return { kind: 'already', paymentId: bound.paymentId };
    return finish(bound.paymentId, bound.userId, purchaseToken, g.orderId);
  }
  // ⓪ 정상 경로가 끝날 시간을 준다.
  if (now - purchaseTimeMs < RTDN_GRACE_MS) throw new RtdnRetryLater(`grace ${Math.round((now - purchaseTimeMs) / 1000)}s`);

  const notOurCheckout = g.purchaseType === 0 || g.purchaseType === 1 || g.purchaseType === 2;
  const lastTry = sql`coalesce(${iapOrders.playCheckoutAt}, ${iapOrders.createdAt})`;
  const rows = (
    await db
      .select({
        paymentId: iapOrders.portoneOrderId,
        userId: iapOrders.userId,
        status: iapOrders.status,
        token: iapOrders.playPurchaseToken,
      })
      .from(iapOrders)
      .where(
        and(
          eq(iapOrders.provider, 'play'),
          eq(iapOrders.playSku, sku),
          // ⚠ sql 식과 비교할 땐 Date를 그대로 넘기면 드라이버가 인코딩하지 못한다 — ISO 문자열 + timestamptz 캐스트.
          gte(lastTry, sql`${new Date(purchaseTimeMs - RTDN_LOOKBACK_MS).toISOString()}::timestamptz`),
        ),
      )
  ).map((r) => ({ paymentId: r.paymentId, userId: r.userId, status: r.status, hasToken: r.token != null }));
  const pick = notOurCheckout ? null : pickRtdnCandidate(rows);
  if (!pick) {
    await raisePaymentAlert('PLAY_RTDN_UNMATCHED', {
      paymentId: `rtdn:${g.orderId ?? purchaseToken.slice(0, 16)}`,
      detail: `구글 주문 ${g.orderId ?? '?'}(${sku}${notOurCheckout ? `, purchaseType ${g.purchaseType}` : ''}) — 최근 6시간 같은 상품 주문 ${rows.length}건(${rows.map((r) => `${r.paymentId}:${r.status}${r.hasToken ? '+토큰' : ''}`).join(', ') || '없음'})이라 자동 지급하지 않음. Play Console에서 구매자 확인 뒤 /api/admin/play-complete-order로 지급.`,
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
  // 중복 결제는 completePurchase가 자동 환불·경보까지 끝냈다.
  if (r.code === 'DUPLICATE' || r.code === 'NOT_GRANTED') return { kind: 'ignored', reason: 'grant skipped (duplicate/minor)' };
  // TOKEN_USED는 completePurchase가 이미 PLAY_TOKEN_USED로 알렸다. REFUNDED는 환불 확정 — 지급 실패가 아니다. PENDING은 보류 결제.
  if (r.code === 'TOKEN_USED' || r.code === 'REFUNDED' || r.code === 'PENDING') return { kind: 'ignored', reason: r.code };
  await raisePaymentAlert('PLAY_RTDN_FAILED', {
    paymentId,
    detail: `RTDN 지급 실패 ${r.code} — 구글 주문 ${googleOrderId ?? '?'}`,
  });
  return { kind: 'failed', paymentId, code: r.code };
}
