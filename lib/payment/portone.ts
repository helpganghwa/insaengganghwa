import 'server-only';

/**
 * 포트원(PortOne) V2 결제 서버 검증 — REST API 단건 조회.
 * 결제 성사 여부·금액·통화는 **포트원 서버에서 재확인**(클라/웹훅 본문 신뢰 금지, CLAUDE §3.1/§3.4).
 * 인증: `Authorization: PortOne {API_SECRET}`. 문서: https://developers.portone.io/api/rest-v2
 */
const API_BASE = 'https://api.portone.io';

function apiSecret(): string {
  const s = process.env.PORTONE_API_SECRET;
  if (!s) throw new Error('PORTONE_API_SECRET missing');
  return s;
}

/** 포트원 결제 상태 — 우리가 "지급해도 되는" 상태는 PAID(+가상계좌 발급은 입금 후 PAID). */
export type PortonePaymentStatus =
  | 'READY'
  | 'PAID'
  | 'VIRTUAL_ACCOUNT_ISSUED'
  | 'PARTIAL_CANCELLED'
  | 'CANCELLED'
  | 'FAILED'
  | 'PAY_PENDING';

export type PortonePayment = {
  status: PortonePaymentStatus;
  /** 결제 총액(원). amount.total. */
  amountTotal: number;
  currency: string;
  /** 우리가 주문 생성 시 넘긴 결제 id(= portone_order_id). */
  paymentId: string;
};

/**
 * 결제 전체 취소(환불) — 관리자 환불에서 호출. POST /payments/{paymentId}/cancel, 필수 reason.
 * 이미 취소된 결제면 포트원이 4xx(PAYMENT_ALREADY_CANCELLED 등) → throw. 호출부가 무시/분기.
 * 취소 성공 후 재화 회수는 refundPurchase(웹훅과 멱등)로 별도 수행.
 */
export async function cancelPortonePayment(paymentId: string, reason: string): Promise<void> {
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `PortOne ${apiSecret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`portone cancel ${res.status}: ${body.slice(0, 300)}`);
  }
}

/**
 * 결제 단건 조회. 미존재(404)·미결제는 null이 아니라 status로 구분 — 호출부가 PAID 검증.
 * 네트워크/HTTP 오류는 throw(웹훅 재시도·액션 에러로 노출).
 */
export async function getPortonePayment(paymentId: string): Promise<PortonePayment> {
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${apiSecret()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`portone getPayment ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status: PortonePaymentStatus;
    id?: string;
    paymentId?: string;
    currency: string;
    amount?: { total?: number };
  };
  return {
    status: data.status,
    amountTotal: data.amount?.total ?? 0,
    currency: data.currency,
    paymentId: data.paymentId ?? data.id ?? paymentId,
  };
}
