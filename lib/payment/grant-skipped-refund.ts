import 'server-only';

import { raisePaymentAlert } from './alert';
import { refundPlayOrder } from './play-api';
import { cancelPortonePayment, getPortonePayment } from './portone';
import { refundPurchase } from './refund';

/**
 * 지급 보류(중복·미성년)로 paid가 된 주문의 환불 마감 재시도 — 정산 크론 C단계가 30분 지난 건에 부른다.
 * 인라인 자동 환불 전에 함수가 죽으면 청구·미지급·미환불로 남기 때문이다. 성공하면 true, 실패는 경보(주문당 1회).
 */
export async function retryGrantSkippedRefund(o: {
  id: bigint;
  pid: string;
  provider: string;
  playOrderId: string | null;
}): Promise<boolean> {
  // 구글 환불 API까지 성공했는지 — 이후 예외면 '환불 필요'가 아니라 '마감만 지연'이다.
  let playRefundCalled = false;
  try {
    let r: Awaited<ReturnType<typeof refundPurchase>>;
    if (o.provider === 'play') {
      // 먼저 구글 상태로 마감을 시도한다 — 이미 환불된 주문(인라인 환불 뒤 마감만 실패, 운영자 콘솔 환불)에
      // 환불 API를 다시 부르면 오류로 거짓 경보가 난다. 아직 구매 완료 상태(NOT_CANCELLED)일 때만 환불한다.
      r = await refundPurchase(o.pid, { reason: 'error' });
      if (!r.ok && r.code === 'NOT_CANCELLED') {
        if (!o.playOrderId) throw new Error('구글 주문번호 없음');
        await refundPlayOrder(o.playOrderId, true);
        playRefundCalled = true;
        r = await refundPurchase(o.pid, { reason: 'error', playVoided: true });
      }
    } else {
      const pay = await getPortonePayment(o.pid);
      if (pay.status === 'PAID') await cancelPortonePayment(o.pid, '지급 보류 결제 자동 환불(재시도)');
      r = await refundPurchase(o.pid, { reason: 'error' });
    }
    if (r.ok) return true;
    await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
      paymentId: `skipped-refund:${o.pid}`,
      orderId: o.id,
      detail: `지급 보류(중복·미성년) 결제의 환불 마감 실패(code=${r.code}) — ${o.provider === 'play' ? 'Play' : '포트원'} 콘솔에서 환불 확인 필요.`,
      onceEver: true,
    });
    return false;
  } catch (e) {
    console.error('[grant-skipped-refund] retry failed', o.pid, e);
    await raisePaymentAlert('REFUND_RECLAIM_FAILED', {
      paymentId: `skipped-refund:${o.pid}`,
      orderId: o.id,
      detail: playRefundCalled
        ? `지급 보류(중복·미성년) Play 결제 — 구글 환불은 완료, 주문 마감만 실패(${(e as Error)?.message ?? e}). play-sync 환불 동기화가 곧 마감 — 확인만.`
        : `지급 보류(중복·미성년) 결제의 자동 환불 재시도 실패 — ${(e as Error)?.message ?? e}. ${o.provider === 'play' ? 'Play' : '포트원'} 콘솔에서 환불 필요.`,
      onceEver: true,
    }).catch(() => undefined);
    return false;
  }
}
