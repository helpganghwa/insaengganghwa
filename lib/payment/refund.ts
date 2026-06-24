import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders, iapRefunds, monthlyPurchaseLimits } from '@/lib/db/schema/payment';
import { mailbox } from '@/lib/db/schema/mailbox';
import { kstMonthString } from '@/lib/kst';
import { reclaimProductGrant } from '@/lib/game/shop/grant';

import { getPortonePayment } from './portone';

export type RefundResult =
  | { ok: true; already: boolean }
  | { ok: false; code: 'ORDER_NOT_FOUND' | 'NOT_CANCELLED' };

/**
 * 결제 전체 취소(환불) 처리 — 웹훅 Transaction.Cancelled에서 호출(멱등). REGULATORY §환불 시 재화 자동 회수.
 *  portone_order_id로 주문 조회 → 포트원 서버에서 CANCELLED 재확인(본문 신뢰 X) → 트랜잭션으로
 *  주문 refunded 전이 + 지급 회수(reclaimProductGrant) + 월 누적 차감 + iap_refunds 기록.
 *  멱등: 이미 refunded면 회수 없이 already. 동시(웹훅 재전송) 호출은 FOR UPDATE + status 가드로 1회만.
 *  부분취소(PartialCancelled)는 고정가 디지털 상품 특성상 드물어 자동 회수 대상 아님(웹훅에서 로그만).
 */
export async function refundPurchase(paymentId: string): Promise<RefundResult> {
  const [order] = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      productCode: iapOrders.productCode,
      amountKrw: iapOrders.amountKrw,
      status: iapOrders.status,
      paidAt: iapOrders.paidAt,
      createdAt: iapOrders.createdAt,
    })
    .from(iapOrders)
    .where(eq(iapOrders.portoneOrderId, paymentId))
    .limit(1);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
  if (order.status === 'refunded') return { ok: true, already: true };

  // 포트원 서버 권위 — 실제 전체 취소 상태인지 재확인.
  const pay = await getPortonePayment(paymentId);
  if (pay.status !== 'CANCELLED') return { ok: false, code: 'NOT_CANCELLED' };

  // 월 누적은 결제가 집계된 달(결제월) 기준으로 되돌린다 — 취소가 다음 달에 와도 정확.
  const paidMonth = kstMonthString(order.paidAt ?? order.createdAt);

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: iapOrders.status })
      .from(iapOrders)
      .where(eq(iapOrders.id, order.id))
      .for('update');
    if (!locked || locked.status === 'refunded') return; // 이미 다른 호출이 처리.
    const wasPaid = locked.status === 'paid';

    await tx.update(iapOrders).set({ status: 'refunded' }).where(eq(iapOrders.id, order.id));

    if (wasPaid) {
      // 지급분 회수 + 미성년 월 한도 누적 되돌리기(0 클램프).
      await reclaimProductGrant(tx, order.userId, order.serverId, order.productCode);
      await tx
        .update(monthlyPurchaseLimits)
        .set({ totalKrw: sql`GREATEST(0, ${monthlyPurchaseLimits.totalKrw} - ${order.amountKrw})` })
        .where(
          and(
            eq(monthlyPurchaseLimits.userId, order.userId),
            eq(monthlyPurchaseLimits.kstMonth, paidMonth),
          ),
        );

      // 환불 안내 우편 — 지급분 회수된 경우에만(notice, 보상 없음). 웹훅·어드민 환불 공통.
      await tx.insert(mailbox).values({
        userId: order.userId,
        serverId: order.serverId,
        type: 'notice',
        title: '결제 환불 안내',
        body: `결제(₩${Number(order.amountKrw).toLocaleString('ko-KR')})가 환불 처리되어, 지급되었던 재화를 회수했습니다. 문의는 고객센터로 연락 주세요.`,
        senderLabel: '인생강화',
        payload: {},
      });
    }

    // 환불 감사 기록 — clawbackDone은 지급분을 회수했는지(pending 취소면 회수 없음).
    await tx.insert(iapRefunds).values({
      orderId: order.id,
      userId: order.userId,
      reason: 'user',
      amountKrw: order.amountKrw,
      clawbackDone: wasPaid,
    });
  });

  return { ok: true, already: false };
}
