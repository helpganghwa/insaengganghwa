'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { adminActions } from '@/lib/db/schema/ops';
import { cancelPortonePayment } from '@/lib/payment/portone';
import {
  type ClawbackPreview,
  formatClawbackShortfall,
  previewClawback,
  refundPurchase,
} from '@/lib/payment/refund';
import { parseBpProduct } from '@/lib/payment/purchase';
import { bpSegmentClaimedAny } from '@/lib/game/battlepass';

/**
 * 관리자 환불 — 결제건을 포트원에서 취소하고 지급 재화를 회수(refundPurchase).
 *  - status='paid'만 환불 대상. pending/refunded는 차단.
 *  - **PG 취소 전에** previewClawback으로 회수 가능액을 확인한다. 어드민 경로는 우리가 취소를
 *    일으키는 유일한 지점이라, 여기서 막아야 "환불은 나가고 재화는 남는" 상태를 애초에 안 만든다.
 *    (환불 약관 §1 — 이미 사용·소모한 재화는 청약철회 제한. 웹훅/크론은 이미 취소된 뒤라 사후 기록만.)
 *  - 부족해도 운영 판단으로 진행해야 하면 force=true + 사유 필수 → admin_actions에 감사 기록.
 *  - 포트원이 이미 취소된 결제(콘솔에서 먼저 취소)면 cancel이 에러 → 무시하고 회수만 진행.
 *  - refundPurchase가 포트원 CANCELLED 재확인 후 다이아·상자 회수(0 클램프)·주문 refunded·iap_refunds 기록.
 *    포트원이 여전히 PAID면(취소 실패) 회수하지 않고 NOT_CANCELLED 반환(재화 보존).
 */
export async function refundOrderAction(
  orderId: string,
  opts?: { force?: boolean; forceReason?: string },
) {
  const adminUserId = await requireAdmin();

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
      grantSkipped: iapOrders.grantSkipped,
    })
    .from(iapOrders)
    .where(eq(iapOrders.id, id))
    .limit(1);
  if (!order) return { status: 'error', code: 'NOT_FOUND' } as const;
  if (order.status === 'refunded')
    return { status: 'success', already: true, forced: false, message: undefined } as const;
  if (order.status !== 'paid') return { status: 'error', code: 'NOT_REFUNDABLE' } as const;
  // 배틀패스(성장패스)는 프리미엄 보상을 하나라도 수령했으면 환불 불가(미수령이면 환불 가능).
  // 단 grant_skipped(중복 결제로 지급이 없었던 주문)는 예외 — 이 주문이 준 것이 없으므로
  // 회수도 없고, 막아두면 운영자가 어드민 대신 PG 콘솔로 취소하게 된다. 콘솔 경로는 웹훅으로
  // 직행해 reclaimBpSegment가 **다른 주문이 산 구간·수령분**을 회수한다(안전한 길을 열어 둔다).
  const bp = parseBpProduct(order.product);
  if (
    bp &&
    !order.grantSkipped &&
    (await bpSegmentClaimedAny(order.userId, order.serverId, bp.type, bp.segmentIndex))
  ) {
    return { status: 'error', code: 'BP_NOT_REFUNDABLE' } as const;
  }

  // 회수 사전 검사 — 부족하면 포트원 취소도 하지 않는다(되돌릴 수 없는 순서).
  // grant_skipped 주문(특가 중복·미성년 보류)은 지급 자체가 없어 회수 대상이 아니다 —
  // 상품 지급량으로 잔액을 재면 "쓰지도 않은 재화"를 이유로 환불이 막힌다.
  const preview: ClawbackPreview = order.grantSkipped
    ? { diamondNeed: 0, diamondHave: 0, boxesNeed: 0, boxesHave: 0, sufficient: true }
    : await previewClawback(order.userId, order.serverId, order.product);
  const reason = (opts?.forceReason ?? '').trim();
  if (!preview.sufficient) {
    if (!opts?.force)
      return {
        status: 'error',
        code: 'CLAWBACK_INSUFFICIENT',
        message: formatClawbackShortfall(preview),
      } as const;
    if (reason.length < 2)
      return { status: 'error', code: 'FORCE_REASON_REQUIRED' } as const;
    // 약관 예외를 사람이 결정한 건이라 실행 전에 남긴다 — 뒤에서 취소가 실패해도
    // "누가·왜·얼마나 모자란 걸 알고도 진행했는지"는 기록에 남아야 한다.
    await db.insert(adminActions).values({
      adminUserId,
      action: 'payment.refund.force',
      targetType: 'iap_order',
      targetId: order.id.toString(),
      payload: {
        portoneOrderId: order.portoneOrderId,
        product: order.product,
        userId: order.userId,
        serverId: order.serverId,
        reason,
        preview,
      },
    });
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
  return {
    status: 'success',
    already: r.already,
    forced: !preview.sufficient,
    // 미회수 잔액 — 운영자가 즉시 후속 조치(채권/제재)를 판단할 수 있게 그대로 알린다.
    message: r.short
      ? `환불 완료 — 회수하지 못한 잔액: 다이아 ${r.short.diamond.toLocaleString('ko-KR')} · 상자 ${r.short.boxes.toLocaleString('ko-KR')}(미회수로 기록·알림 발송)`
      : undefined,
  } as const;
}
