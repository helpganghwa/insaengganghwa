import PortOne from '@portone/browser-sdk/v2';

import { createOrderAction, verifyPurchaseAction } from './actions';

/**
 * 포트원 V2 결제창 호출 — 서버 주문 생성 → 결제창 → (팝업 복귀 시) 서버 검증·지급.
 *  PC는 팝업 모드로 여기서 끝까지 처리, 모바일은 redirectUrl로 페이지 이동 후 /shop/pay/complete가 검증.
 *  어느 경로든 최종 지급 권위는 서버(웹훅 + verify) — 이 함수 반환은 UX 표시용.
 */
export type CheckoutResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: 'cancel' | 'create' | 'verify'; code?: string };

export async function runCheckout(productId: string, redirectUrl: string): Promise<CheckoutResult> {
  const r = await createOrderAction(productId);
  if (r.status !== 'success') return { ok: false, reason: 'create', code: r.code };

  const { paymentId, orderName, amountKrw, storeId, channelKey, customerName } = r.order;
  const resp = await PortOne.requestPayment({
    storeId,
    channelKey,
    paymentId,
    orderName,
    totalAmount: amountKrw,
    currency: 'CURRENCY_KRW',
    payMethod: 'CARD',
    // 이니시스 V2 일반결제는 구매자 이름 필수 — 닉네임을 customer.fullName으로 전달.
    customer: { fullName: customerName },
    redirectUrl, // 모바일: 결제 후 이 URL로 복귀(complete 페이지가 검증). PC 팝업은 미사용.
  });

  // 모바일 리다이렉트면 위에서 페이지가 이동해 여기 도달 안 함. 도달(팝업)했는데 code 있으면 취소/실패.
  if (resp?.code != null) return { ok: false, reason: 'cancel', code: resp.message ?? resp.code };

  const v = await verifyPurchaseAction(paymentId);
  if (v.status !== 'success') return { ok: false, reason: 'verify', code: v.code };
  return { ok: true, already: v.already };
}
