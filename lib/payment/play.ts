import 'server-only';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { raisePaymentAlert } from './alert';
import { consumePlayProductPurchase, listPlayVoidedPurchases, playConfigured, PlayApiError } from './play-api';
import { refundPurchase } from './refund';

/**
 * Play 결제 사후 정합화(docs/PLAYSTORE.md §3.2) — cron play-sync(매일)가 호출.
 *  A. 소모 재시도: paid인데 play_consumed_at이 없는 주문. 소모(=확인) 없이 3일이 지나면 구글이
 *     자동 환불하므로 completePurchase 직후 소모 실패분을 여기서 되살린다.
 *  B. 환불 동기화: 구글 voided purchases(최근 30일) → 토큰으로 주문을 찾아 refundPurchase
 *     (Play 주문은 구글 상태 '취소됨'을 재확인한 뒤 지급분 회수·월누적 복원·환불 우편).
 */

const VOIDED_LOOKBACK_MS = 30 * 24 * 3_600_000;

export async function retryPlayConsume(limit = 50): Promise<{ scanned: number; consumed: number; failed: number }> {
  if (!playConfigured()) return { scanned: 0, consumed: 0, failed: 0 };
  const rows = await db
    .select({ id: iapOrders.id, sku: iapOrders.playSku, token: iapOrders.playPurchaseToken, pid: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.status, 'paid'),
        isNull(iapOrders.playConsumedAt),
        isNotNull(iapOrders.playPurchaseToken),
      ),
    )
    .limit(limit);
  let consumed = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.sku || !r.token) continue;
    try {
      await consumePlayProductPurchase(r.sku, r.token);
      await db.update(iapOrders).set({ playConsumedAt: new Date() }).where(eq(iapOrders.id, r.id));
      consumed++;
    } catch (e) {
      // 이미 소모된 토큰(다른 경로에서 성공했는데 기록만 실패)은 400으로 온다 — 기록만 맞춘다.
      if (e instanceof PlayApiError && e.status === 400 && /consum/i.test(e.message)) {
        await db.update(iapOrders).set({ playConsumedAt: new Date() }).where(eq(iapOrders.id, r.id));
        consumed++;
        continue;
      }
      failed++;
      console.error('[play-sync] consume failed', r.pid, e);
      await raisePaymentAlert('COMPLETE_EXCEPTION', {
        paymentId: r.pid,
        orderId: r.id,
        detail: `Play 소모(consume) 재시도 실패 — 3일 내 미소모면 구글이 자동 환불한다. ${(e as Error).message.slice(0, 160)}`,
      });
    }
  }
  return { scanned: rows.length, consumed, failed };
}

export async function syncPlayVoided(): Promise<{ voided: number; refunded: number; already: number; unknown: number; failed: number }> {
  if (!playConfigured()) return { voided: 0, refunded: 0, already: 0, unknown: 0, failed: 0 };
  const list = await listPlayVoidedPurchases(Date.now() - VOIDED_LOOKBACK_MS);
  let refunded = 0;
  let already = 0;
  let unknown = 0;
  let failed = 0;
  for (const v of list) {
    const [order] = await db
      .select({ id: iapOrders.id, pid: iapOrders.portoneOrderId, status: iapOrders.status })
      .from(iapOrders)
      .where(eq(iapOrders.playPurchaseToken, v.purchaseToken))
      .limit(1);
    if (!order) {
      // 우리 주문과 연결되지 않은 구매(검증 전 취소·테스트 구매 등) — 지급된 것이 없으니 기록만.
      unknown++;
      continue;
    }
    if (order.status === 'refunded') {
      already++;
      continue;
    }
    try {
      const r = await refundPurchase(order.pid);
      if (r.ok && !r.already) refunded++;
      else if (r.ok) already++;
      else {
        failed++;
        console.warn('[play-sync] refund not applied', order.pid, r.code);
      }
    } catch (e) {
      failed++;
      console.error('[play-sync] refund failed', order.pid, e);
    }
  }
  return { voided: list.length, refunded, already, unknown, failed };
}

/** 어드민·스크립트용: 주문 id로 Play 주문 요약(환불 안내에 표시). */
export async function playOrderSummary(orderId: bigint): Promise<{ playOrderId: string | null; consumedAt: Date | null } | null> {
  const [r] = await db
    .select({ playOrderId: iapOrders.playOrderId, consumedAt: iapOrders.playConsumedAt })
    .from(iapOrders)
    .where(and(eq(iapOrders.id, orderId), eq(iapOrders.provider, 'play')))
    .limit(1);
  return r ? { playOrderId: r.playOrderId, consumedAt: r.consumedAt } : null;
}
