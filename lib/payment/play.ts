import 'server-only';

import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';

import { raisePaymentAlert } from './alert';
import {
  consumePlayProductPurchase,
  getPlayOrder,
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
        // 지급 보류 주문(미성년 한도·중복 특가)은 소모하지 않는다(2026-09-24 감사) — 자동 환불 호출이 실패했어도
        // 미확인으로 두면 구글이 3일 뒤 자동 환불하고 voided 동기화가 마감한다. 소모하면 청구·미지급·미환불로 굳는다.
        eq(iapOrders.grantSkipped, false),
      ),
    )
    // 오래된 것부터 — 정렬이 없으면 실패가 반복되는 행이 limit을 점유해 다른 주문 소모가 밀린다(감사 C4).
    .orderBy(asc(iapOrders.paidAt))
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
      // voided 목록 자체가 구글의 환불·무효 확정이다 — 지불거절(chargeback) 등은 구매 상태가 1이 아닐 수 있어
      // 상태 재확인에 막히면 29일 동안 매번 실패로 남았다(2026-09-24 감사). 목록을 권위로 인정한다.
      const r = await refundPurchase(order.pid, { playVoided: true });
      if (r.ok && !r.already) refunded++;
      else if (r.ok) already++;
      else {
        failed++;
        console.warn('[play-sync] refund not applied', order.pid, r.code);
        await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
          // 다른 경로(중복·미성년 취소 실패)의 같은 주문 경보와 분리 — 해결 처리 뒤 voided 회수 실패가 가려지지 않게.
          paymentId: `voided-fail:${order.pid}`,
          orderId: order.id,
          detail: `구글 voided인데 회수 미적용(code=${r.code}) — 수동 확인 필요.`,
          onceEver: true,
        }).catch(() => undefined);
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
 * 두 단계로 본다(2026-09-29). ① 구매 조회(products.get) purchaseState 1 → 취소. ② 아니면 주문 조회(orders.get) state가
 * REFUNDED·CANCELED면 취소. 콘솔에서 환불한 **이미 소모된** 구매는 ①이 한동안 0(구매 완료)으로 남고 voided 목록 반영도 늦어
 * 회수가 수 시간 밀렸다(09-29 실측: 12:18 콘솔 환불, orders.get은 12:21에 이미 REFUNDED, 12:24 크론은 둘 다 못 잡음).
 * PARTIALLY_REFUNDED는 회수 금액을 정할 수 없어 자동 회수하지 않고 경보만 남긴다(주문당 1회).
 *
 * 2026-09-11 첫 Play 환불에서 구글 구매 상태는 곧바로 '취소됨'(purchaseState 1)이 됐는데
 * voided 목록은 비어 있었다. 목록 반영이 늦거나 일부 환불이 빠지면 회수가 통째로 누락되므로,
 * 최근 주문만 토큰으로 직접 확인한다. 30일 voided 스윕은 그대로 두어 오래된 건을 받친다.
 *
 * 회수는 refundPurchase에 맡긴다 — 주문 행을 for update로 잠그고 이미 refunded면 빠져나오므로
 * voided 경로와 겹쳐도 두 번 회수되지 않는다. 구글 상태 재확인도 그쪽에서 한 번 더 한다.
 */
const CANCEL_CHECK_WINDOW_HOURS = 48;
/**
 * 한 번에 확인하는 주문 수 상한 — 창 안 결제를 **전부** 봐야 한다. 오래된 순이라 상한에 걸리면 가장 최근 결제(콘솔 환불이
 * 가장 흔한 쪽)부터 빠진다. 50이던 시절 48시간 결제가 70건이라 최신 20건이 확인되지 않았다(09-29).
 * 호출은 주문당 최대 2회(구매·주문 조회) — 200건이면 10분에 400회, 하루 할당량(20만) 안.
 */
const CANCEL_CHECK_LIMIT = 200;
/** 이 단계에 쓰는 시간 상한 — 함수 한도(300초) 안에서 다른 단계·하트비트 몫을 남긴다. 넘으면 남은 행은 다음 회차(10분 뒤)가 본다. */
const CANCEL_CHECK_BUDGET_MS = 240_000;

export async function syncPlayCancelledRecent(
  limit = CANCEL_CHECK_LIMIT,
): Promise<{ scanned: number; refunded: number; failed: number }> {
  if (!playConfigured()) return { scanned: 0, refunded: 0, failed: 0 };
  const rows = await db
    .select({ id: iapOrders.id, sku: iapOrders.playSku, token: iapOrders.playPurchaseToken, pid: iapOrders.portoneOrderId, playOrderId: iapOrders.playOrderId })
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
    // 최신 결제부터 — 콘솔 환불은 대개 방금 한 결제에 몰린다. 시간·상한에 걸려 빠지는 쪽이 오래된 결제가 되게 한다.
    .orderBy(desc(iapOrders.paidAt))
    .limit(limit);
  const deadline = Date.now() + CANCEL_CHECK_BUDGET_MS;
  // 상한에 닿았으면 최근 결제 일부를 못 봤다 — 조용히 넘기지 않고 로그로 드러낸다(상한을 올릴 신호).
  if (rows.length >= limit) console.warn(`[play-sync] cancelled check capped at ${limit} — 최근 결제 일부 미확인`);
  let refunded = 0;
  let failed = 0;
  for (const r of rows) {
    if (Date.now() > deadline) {
      console.warn(`[play-sync] cancelled check time budget reached — 남은 ${rows.length - rows.indexOf(r)}건은 다음 회차`);
      break;
    }
    try {
      const p = await getPlayProductPurchase(r.sku!, r.token!);
      let res: Awaited<ReturnType<typeof refundPurchase>>;
      if (p.purchaseState === 1) {
        res = await refundPurchase(r.pid);
      } else {
        // 구매 상태가 아직 취소가 아니어도 주문이 환불·취소됐을 수 있다(소모된 구매의 콘솔 환불). 주문번호가 없으면 확인할 길이 없다.
        if (!r.playOrderId) continue;
        const o = await getPlayOrder(r.playOrderId);
        if (o.state === 'PARTIALLY_REFUNDED') {
          await raisePaymentAlert('PARTIAL_CANCELLED', {
            paymentId: `play-partial:${r.pid}`,
            orderId: r.id,
            detail: `구글 주문 ${r.playOrderId} 부분 환불 — 회수 금액을 정할 수 없어 자동 회수하지 않음. 콘솔에서 환불 금액 확인 뒤 수동 처리.`,
            onceEver: true,
          }).catch(() => undefined);
          continue;
        }
        if (o.state !== 'REFUNDED' && o.state !== 'CANCELED') continue; // 구매 완료·환불 대기 등 — 회수 대상 아님.
        // 주문 조회가 구글의 환불 확정이다 — 구매 상태 재확인(아직 0)에 막히지 않게 playVoided로 넘긴다.
        res = await refundPurchase(r.pid, { playVoided: true });
      }
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
