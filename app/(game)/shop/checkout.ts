import PortOne from '@portone/browser-sdk/v2';

import { createOrderAction, verifyPurchaseAction } from './actions';

/**
 * 포트원 V2 결제창 호출 — 서버 주문 생성 → 결제창 → (팝업 복귀 시) 서버 검증·지급.
 *  PC는 팝업 모드로 여기서 끝까지 처리, 모바일은 redirectUrl(/shop)로 복귀 후 ShopTabs가 검증.
 *  어느 경로든 최종 지급 권위는 서버(웹훅 + verify) — 이 함수 반환은 UX 표시용.
 */
export type CheckoutResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: 'cancel' | 'create' | 'verify'; code?: string };

export async function runCheckout(productId: string, redirectUrl: string): Promise<CheckoutResult> {
  // 단계별 전송실패 매핑(2026-07-07 전수감사) — 호출부 일괄 catch가 전부 'create/NETWORK'
  // ("요청이 전송되지 않았어요")로 표기하면, 결제 완료 후 verify 전송만 실패한 경우(지급은
  // 웹훅이 보장)에 유저가 미결제로 오해한다. reject를 단계에서 잡아 reason을 보존한다.
  const r = await createOrderAction(productId).catch(() => null);
  if (!r) return { ok: false, reason: 'create', code: 'NETWORK' };
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

  const v = await verifyPurchaseAction(paymentId).catch(() => null);
  // verify 전송실패 — 결제는 이미 성사됐을 수 있음(지급 권위는 웹훅). 'verify'로 구분해
  // 호출부가 "결제 확인 지연" 안내를 하게 한다.
  if (!v) return { ok: false, reason: 'verify', code: 'NETWORK' };
  if (v.status !== 'success') return { ok: false, reason: 'verify', code: v.code };
  return { ok: true, already: v.already };
}
