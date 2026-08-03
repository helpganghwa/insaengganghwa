import PortOne from '@portone/browser-sdk/v2';

import { createOrderAction, verifyPurchaseAction } from './actions';

/**
 * 포트원 V2 결제창 호출 — 서버 주문 생성 → 결제창 → (팝업 복귀 시) 서버 검증·지급.
 *  PC는 팝업 모드로 여기서 끝까지 처리, 모바일은 redirectUrl(/shop)로 복귀 후 ShopTabs가 검증.
 *  어느 경로든 최종 지급 권위는 서버(웹훅 + verify) — 이 함수 반환은 UX 표시용.
 */
export type CheckoutResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: 'cancel' | 'create' | 'verify'; code?: string }
  /** 결제창이 실패로 닫힘(카드 거절·한도·심사 전 미승인 등) — 사유를 유저에게 보여줘야 한다. */
  | { ok: false; reason: 'window'; message: string };

/**
 * 결제 실패 안내 문구 — 모바일 복귀(리다이렉트) 시 포트원이 붙여 주는 사유를 그대로 보여준다.
 * PC(팝업)는 resp.message를 바로 노출하는데 모바일만 일반 문구로 덮이면 원인을 알 수 없다
 * (2026-08-03 '승인되지 않은 가맹점'이 모바일에서만 가려진 사례). URL 유래 문자열이라 길이를 자른다.
 */
export function payFailTitle(pgMessage?: string | null): string {
  const m = pgMessage?.trim();
  if (!m) return '결제가 완료되지 않았습니다';
  return m.length > 60 ? `${m.slice(0, 60)}…` : m;
}

export async function runCheckout(productId: string, redirectUrl: string): Promise<CheckoutResult> {
  // 단계별 전송실패 매핑(2026-07-07 전수감사) — 호출부 일괄 catch가 전부 'create/NETWORK'
  // ("요청이 전송되지 않았어요")로 표기하면, 결제 완료 후 verify 전송만 실패한 경우(지급은
  // 웹훅이 보장)에 유저가 미결제로 오해한다. reject를 단계에서 잡아 reason을 보존한다.
  const r = await createOrderAction(productId).catch(() => null);
  if (!r) return { ok: false, reason: 'create', code: 'NETWORK' };
  if (r.status !== 'success') return { ok: false, reason: 'create', code: r.code };

  const { paymentId, orderName, amountKrw, storeId, channelKey, customerName, customerEmail, customerPhone } =
    r.order;
  const resp = await PortOne.requestPayment({
    storeId,
    channelKey,
    paymentId,
    orderName,
    totalAmount: amountKrw,
    currency: 'CURRENCY_KRW',
    payMethod: 'CARD',
    // 이니시스 V2 일반결제는 구매자 이름·이메일·휴대폰이 전부 필수(누락 시 결제창 BadRequest,
    // 2026-07-31 카드사 심사 테스트에서 순차 확인). 휴대폰은 본인인증 번호(0143) 우선,
    // 미인증·심사 계정은 사업자 연락처 — 값은 서버(createOrder)가 정한다.
    customer: { fullName: customerName, email: customerEmail, phoneNumber: customerPhone },
    redirectUrl, // 모바일: 결제 후 이 URL로 복귀(complete 페이지가 검증). PC 팝업은 미사용.
  });

  // 모바일 리다이렉트면 위에서 페이지가 이동해 여기 도달 안 함. 도달(팝업)했는데 code 있으면 취소/실패.
  if (resp?.code != null) {
    // 유저 취소는 조용히, 그 외(카드 거절·심사 전 미승인 등)는 사유 노출 — 전부 '취소'로
    // 묶어 침묵하면 실패가 무반응이 된다(2026-07-31 카드사 심사 테스트 제보).
    const msg = resp.message ?? resp.code;
    if (/취소|cancel/i.test(msg)) return { ok: false, reason: 'cancel', code: msg };
    return { ok: false, reason: 'window', message: msg };
  }

  const v = await verifyPurchaseAction(paymentId).catch(() => null);
  // verify 전송실패 — 결제는 이미 성사됐을 수 있음(지급 권위는 웹훅). 'verify'로 구분해
  // 호출부가 "결제 확인 지연" 안내를 하게 한다.
  if (!v) return { ok: false, reason: 'verify', code: 'NETWORK' };
  if (v.status !== 'success') return { ok: false, reason: 'verify', code: v.code };
  return { ok: true, already: v.already };
}
