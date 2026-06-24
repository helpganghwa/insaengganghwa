'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { cancelPortonePayment } from '@/lib/payment/portone';
import { refundPurchase } from '@/lib/payment/refund';
import { parseBpProduct } from '@/lib/payment/purchase';
import { bpSegmentClaimedAny } from '@/lib/game/battlepass';

/**
 * 관리자 환불 — 결제건을 포트원에서 취소하고 지급 재화를 회수(refundPurchase).
 *  - status='paid'만 환불 대상. pending/refunded는 차단.
 *  - 포트원이 이미 취소된 결제(콘솔에서 먼저 취소)면 cancel이 에러 → 무시하고 회수만 진행.
 *  - refundPurchase가 포트원 CANCELLED 재확인 후 다이아·상자 회수(0 클램프)·주문 refunded·iap_refunds 기록.
 *    포트원이 여전히 PAID면(취소 실패) 회수하지 않고 NOT_CANCELLED 반환(재화 보존).
 */
export async function refundOrderAction(orderId: string) {
  await requireAdmin();

  const id = (() => {
    try {
      return BigInt(orderId);
    } catch {
      return null;
    }
  })();
  if (id == null) return { status: 'error', code: 'BAD_ID' } as const;

  const [order] = await db
    .select({
      id: iapOrders.id,
      userId: iapOrders.userId,
      serverId: iapOrders.serverId,
      portoneOrderId: iapOrders.portoneOrderId,
      status: iapOrders.status,
      product: iapOrders.productCode,
    })
    .from(iapOrders)
    .where(eq(iapOrders.id, id))
    .limit(1);
  if (!order) return { status: 'error', code: 'NOT_FOUND' } as const;
  if (order.status === 'refunded') return { status: 'success', already: true } as const;
  if (order.status !== 'paid') return { status: 'error', code: 'NOT_REFUNDABLE' } as const;
  // 배틀패스(성장패스)는 프리미엄 보상을 하나라도 수령했으면 환불 불가(미수령이면 환불 가능).
  const bp = parseBpProduct(order.product);
  if (bp && (await bpSegmentClaimedAny(order.userId, order.serverId, bp.type, bp.segmentIndex))) {
    return { status: 'error', code: 'BP_NOT_REFUNDABLE' } as const;
  }

  // 포트원 취소(이미 취소된 건이면 에러 → 무시하고 회수로 진행).
  try {
    await cancelPortonePayment(order.portoneOrderId, '관리자 환불');
  } catch (e) {
    console.warn('[admin.refund] portone cancel skipped', (e as Error).message);
  }

  const r = await refundPurchase(order.portoneOrderId);
  if (!r.ok) return { status: 'error', code: r.code } as const; // NOT_CANCELLED = 포트원 여전히 결제됨

  revalidatePath('/admin/payments');
  return { status: 'success', already: r.already } as const;
}
