import 'server-only';

import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { raisePaymentAlert } from './alert';
import {
  consumePlayProductPurchase,
  getPlayProductPurchase,
  listPlayVoidedPurchases,
  playConfigured,
  PlayApiError,
} from './play-api';
import { refundPurchase } from './refund';

/**
 * Play 결제 사후 정합화(docs/PLAYSTORE.md §3.2) — cron play-sync(매일)가 호출.
 *  A. 소모 재시도: paid인데 play_consumed_at이 없는 주문. 소모(=확인) 없이 3일이 지나면 구글이
 *     자동 환불하므로 completePurchase 직후 소모 실패분을 여기서 되살린다.
 *  B. 환불 동기화: 구글 voided purchases(최근 30일) → 토큰으로 주문을 찾아 refundPurchase
 *     (Play 주문은 구글 상태 '취소됨'을 재확인한 뒤 지급분 회수·월누적 복원·환불 우편).
 */

// ⚠ 29일이다(30일 아님). 구글은 startTime이 30일 "이내"여야 한다고 거부하는데, 정확히 30일을 보내면
// 요청이 도달하는 사이 경계를 넘어 항상 400 "Start time must be within [30] days of data"가 난다
// (2026-09-11 첫 환불에서 발각 — 그 예외로 크론 전체가 죽어 회수 단계까지 가지도 못했다).
export const VOIDED_LOOKBACK_MS = 29 * 24 * 3_600_000;

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
      // ⚠ 이 값이 꾸준히 0이 아니면 토큰 매칭이 새는 것이다(지급했는데 환불 회수를 못 함).
      // 크론이 하트비트 detail에 unknown=n을 남기므로 어드민 대시보드에서 추세를 본다
      // (2026-09-12 실측 시점 Play paid 주문 0건 — 알림 임계는 사례가 쌓인 뒤에 정한다).
      unknown++;
      console.warn('[play-sync] 주문 미매칭 voided 구매', v.purchaseToken.slice(0, 12));
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

/**
 * 최근 결제분 취소 여부 직접 조회 — voided purchases 목록에만 기대지 않기 위한 보조 경로.
 *
 * 2026-09-11 첫 Play 환불에서 구글 구매 상태는 곧바로 '취소됨'(purchaseState 1)이 됐는데
 * voided 목록은 비어 있었다. 목록 반영이 늦거나 일부 환불이 빠지면 회수가 통째로 누락되므로,
 * 최근 주문만 토큰으로 직접 확인한다. 30일 voided 스윕은 그대로 두어 오래된 건을 받친다.
 *
 * 회수는 refundPurchase에 맡긴다 — 주문 행을 for update로 잠그고 이미 refunded면 빠져나오므로
 * voided 경로와 겹쳐도 두 번 회수되지 않는다. 구글 상태 재확인도 그쪽에서 한 번 더 한다.
 */
const CANCEL_CHECK_WINDOW_HOURS = 48;

export async function syncPlayCancelledRecent(
  limit = 50,
): Promise<{ scanned: number; refunded: number; failed: number }> {
  if (!playConfigured()) return { scanned: 0, refunded: 0, failed: 0 };
  const rows = await db
    .select({ sku: iapOrders.playSku, token: iapOrders.playPurchaseToken, pid: iapOrders.portoneOrderId })
    .from(iapOrders)
    .where(
      and(
        eq(iapOrders.provider, 'play'),
        eq(iapOrders.status, 'paid'),
        isNotNull(iapOrders.playSku),
        isNotNull(iapOrders.playPurchaseToken),
        // 창을 좁게 잡는 이유: 10분마다 도는 크론이 누적 주문 전체를 매번 조회하면 API 호출이 헛돈다.
        gte(iapOrders.paidAt, sql`now() - interval '${sql.raw(String(CANCEL_CHECK_WINDOW_HOURS))} hours'`),
      ),
    )
    .limit(limit);
  let refunded = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const p = await getPlayProductPurchase(r.sku!, r.token!);
      if (p.purchaseState !== 1) continue; // 0 구매완료 · 2 보류 — 회수 대상 아님.
      const res = await refundPurchase(r.pid);
      if (res.ok && !res.already) refunded++;
      else if (!res.ok) {
        failed++;
        console.warn('[play-sync] cancelled refund not applied', r.pid, res.code);
      }
    } catch (e) {
      failed++;
      console.error('[play-sync] cancelled check failed', r.pid, e);
    }
  }
  return { scanned: rows.length, refunded, failed };
}
