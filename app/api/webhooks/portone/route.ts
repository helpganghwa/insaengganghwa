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

  // 결제 관련 이벤트만 처리. Transaction.Paid → 지급(멱등). 취소/기타는 ack만(환불 회수는 후속).
  if ('data' in webhook && 'paymentId' in webhook.data) {
    if (webhook.type === 'Transaction.Paid') {
      const result = await completePurchase(webhook.data.paymentId);
      if (!result.ok && result.code === 'ORDER_NOT_FOUND') {
        // 우리 주문이 아님(테스트 발사 등) — 재전송 막으려 200.
        return new Response('ok (no order)', { status: 200 });
      }
      // NOT_PAID/AMOUNT_MISMATCH는 일시/이상 상태 — 200으로 ack(재전송해도 동일). 운영 로그로 추적.
    }
  }

  return new Response('ok', { status: 200 });
}
