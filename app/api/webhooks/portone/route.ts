/**
 * 포트원(PortOne) V2 결제 웹훅 — 결제 성사 알림 수신 → 서버 검증 후 지급.
 *
 * 보안/정합성:
 *  - 서명 검증: @portone/server-sdk Webhook.verify(secret, rawBody, headers). raw 텍스트 필수
 *    (JSON 파싱 전 원본으로 서명 대조) → req.text()로 받는다.
 *  - 멱등: completePurchase가 portone_order_id 조회 + 주문 status 가드로 1회만 지급(CLAUDE §3.4).
 *    웹훅은 최대 5회 재전송(exp backoff)되므로 같은 결제가 여러 번 와도 안전.
 *  - 지급 가부는 본문이 아니라 포트원 단건 조회(getPortonePayment)로 재확인 — 본문 신뢰 안 함.
 *
 * 응답: 검증 실패=400(서명 위조), 그 외=200(재전송 중단). 처리 실패는 throw→500으로 재전송 유도.
 */
import * as PortOne from '@portone/server-sdk';

import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook not configured', { status: 503 });

  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);

  let webhook: Awaited<ReturnType<typeof PortOne.Webhook.verify>>;
  try {
    webhook = await PortOne.Webhook.verify(secret, raw, headers);
  } catch {
    // 서명 불일치 — 위조/오설정. 재전송해도 동일하니 400으로 중단.
    return new Response('invalid signature', { status: 400 });
  }

  // 결제 관련 이벤트만 처리(모르는 type은 문서 지침대로 무시·ack). data.paymentId 있는 결제 이벤트만.
  if ('data' in webhook && 'paymentId' in webhook.data) {
    const paymentId = webhook.data.paymentId;

    if (webhook.type === 'Transaction.Paid') {
      const result = await completePurchase(paymentId);
      if (!result.ok) {
        if (result.code === 'NOT_PAID') {
          // 포트원 상태 전파 지연 등 일시적일 수 있음 — 500으로 재전송 유도(멱등하므로 안전).
          //  브라우저가 닫혀 클라 verify가 없을 때 웹훅이 유일 지급 경로라, 일시 실패는 재시도해야 함.
          console.error('[portone.webhook] NOT_PAID, retrying', paymentId);
          return new Response('not paid yet', { status: 500 });
        }
        // ORDER_NOT_FOUND(우리 주문 아님)·AMOUNT_MISMATCH(위변조 의심)는 재전송해도 동일 — 200 ack.
        //  AMOUNT_MISMATCH는 지급하지 않은 채 운영 알림 대상(로그).
        if (result.code === 'AMOUNT_MISMATCH') {
          console.error('[portone.webhook] AMOUNT_MISMATCH', paymentId);
        }
      }
    } else if (webhook.type === 'Transaction.Cancelled') {
      // 전체 취소(환불) — 지급분 회수(멱등). NOT_CANCELLED(전파 지연)는 500으로 재전송 유도.
      const result = await refundPurchase(paymentId);
      if (!result.ok && result.code === 'NOT_CANCELLED') {
        console.error('[portone.webhook] NOT_CANCELLED, retrying', paymentId);
        return new Response('not cancelled yet', { status: 500 });
      }
    } else if (webhook.type === 'Transaction.PartialCancelled') {
      // 부분취소 — 고정가 디지털 상품 특성상 드묾. 자동 회수하지 않고 운영 수동 처리(로그만).
      console.error('[portone.webhook] PartialCancelled (manual ops)', paymentId);
    }
  }

  return new Response('ok', { status: 200 });
}
