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
import { raisePaymentAlert } from '@/lib/payment/alert';
import { getPortonePayment, PortonePaymentNotFoundError } from '@/lib/payment/portone';
import { classifyPaymentFailure } from '@/lib/payment/failure-reason';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 경보 dedup 키용 KST 시간 버킷 — 실패 건별 경보는 소음이라 시간당 1회로 묶는다. */
function kstHourKey(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 13);
}

export async function POST(req: Request) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook not configured', { status: 503 });

  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);

  let webhook: Awaited<ReturnType<typeof PortOne.Webhook.verify>>;
  try {
    webhook = await PortOne.Webhook.verify(secret, raw, headers);
  } catch {
    // 서명 불일치 — 위조/오설정(시크릿 회전 사고면 전 결제 사일런트 실패). 운영 알림 후 400 중단.
    await raisePaymentAlert('WEBHOOK_VERIFY_FAILED', {
      detail: '웹훅 서명 검증 실패. 위조이거나 PORTONE_WEBHOOK_SECRET/PG 설정 불일치 가능 — 즉시 점검.',
    });
    return new Response('invalid signature', { status: 400 });
  }

  // 결제 관련 이벤트만 처리(모르는 type은 문서 지침대로 무시·ack). data.paymentId 있는 결제 이벤트만.
  if ('data' in webhook && 'paymentId' in webhook.data) {
    const paymentId = webhook.data.paymentId;

    if (webhook.type === 'Transaction.Paid') {
      let result;
      try {
        result = await completePurchase(paymentId);
      } catch (e) {
        // 지급 처리 중 예외 — 운영 알림 후 throw(500)로 재전송 유도(멱등하므로 안전).
        await raisePaymentAlert('COMPLETE_EXCEPTION', {
          paymentId,
          detail: `결제 지급 처리 중 예외: ${e instanceof Error ? e.message : String(e)}`,
        });
        throw e;
      }
      if (!result.ok) {
        if (result.code === 'NOT_PAID') {
          // 포트원 상태 전파 지연 등 일시적일 수 있음 — 500으로 재전송 유도(멱등하므로 안전).
          //  브라우저가 닫혀 클라 verify가 없을 때 웹훅이 유일 지급 경로라, 일시 실패는 재시도해야 함.
          console.error('[portone.webhook] NOT_PAID, retrying', paymentId);
          return new Response('not paid yet', { status: 500 });
        }
        // ORDER_NOT_FOUND(우리 주문 아님)·AMOUNT_MISMATCH는 재전송해도 동일 — 200 ack.
        //  AMOUNT_MISMATCH 알림은 completePurchase 내부에서 발생(웹훅·클라 verify 공통 보장).
      }
    } else if (webhook.type === 'Transaction.Cancelled') {
      // 전체 취소(환불) — 지급분 회수(멱등). NOT_CANCELLED(전파 지연)는 500으로 재전송 유도.
      let result;
      try {
        result = await refundPurchase(paymentId);
      } catch (e) {
        // 회수 중 예외 — 환불받고 재화 유지 위험. 운영 알림 후 throw(500)로 재전송 유도.
        await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
          paymentId,
          detail: `환불 회수 중 예외: ${e instanceof Error ? e.message : String(e)}`,
        });
        throw e;
      }
      if (!result.ok && result.code === 'NOT_CANCELLED') {
        console.error('[portone.webhook] NOT_CANCELLED, retrying', paymentId);
        return new Response('not cancelled yet', { status: 500 });
      }
    } else if (webhook.type === 'Transaction.Failed') {
      // PG가 "이 결제 실패했다"고 직접 알려주는 유일한 경로다(2026-09-12 추가). 카드사 설정 사고·
      // 가맹점 미승인이 여기서 즉시 드러난다.
      //
      // ⚠ 다만 이 웹훅은 **유저가 결제창을 닫거나 취소를 눌러도** 온다. 그대로 울리면 경보가 전부
      // 오경보가 된다 — 실서버 4건이 그랬고, 셋은 같은 유저가 1~4분 안에 결제를 성공시켰다
      // (2026-09-13 실측). 그래서 포트원 단건 조회로 **실패 사유를 읽어** 유저 이탈이면 알리지 않는다.
      // 사유를 못 읽으면(조회 실패·사유 없음) 종전대로 울린다 — 놓친 사고보다 오경보가 낫다.
      let verdict = { userCancelled: false, summary: '실패 사유 조회 실패 — 사유 미상' };
      try {
        const pay = await getPortonePayment(paymentId);
        verdict = classifyPaymentFailure(pay.failure);
      } catch (e) {
        if (e instanceof PortonePaymentNotFoundError) {
          // PG에 결제 시도 기록 자체가 없다 — 결제창만 열고 닫은 경우. 사고가 아니다.
          verdict = { userCancelled: true, summary: '포트원에 결제 기록 없음(결제창만 열고 닫음)' };
        } else {
          console.error('[portone.webhook] 실패 사유 조회 실패', paymentId, e);
        }
      }
      if (verdict.userCancelled) {
        // 기록도 남기지 않는다 — 어드민 경보 목록은 '진짜 결제 오류'만 담는다(사용자 확정 2026-09-13).
        console.info(`[portone.webhook] 결제 실패(유저 이탈, 경보 없음) ${paymentId} — ${verdict.summary}`);
      } else {
        // 건별로 울리면 소음이라 KST 시간 버킷으로 묶어 시간당 1회만 울린다.
        await raisePaymentAlert('PAYMENT_FAILED', {
          paymentId: `fail:${kstHourKey()}`,
          detail: `결제 실패(${paymentId}) — ${verdict.summary}. 유저 취소가 아닌 실패다. 같은 시간대 반복되면 결제 경로 점검 필요.`,
        });
      }
    } else if (webhook.type === 'Transaction.PartialCancelled') {
      // 부분취소 — 고정가 디지털 상품 특성상 드묾. 자동 회수하지 않고 운영 수동 처리.
      await raisePaymentAlert('PARTIAL_CANCELLED', {
        paymentId,
        detail: '부분취소 수신 — 자동 회수 대상 아님. 운영 수동 처리 필요.',
      });
    }
  }

  return new Response('ok', { status: 200 });
}
