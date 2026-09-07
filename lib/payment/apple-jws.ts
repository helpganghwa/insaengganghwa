/**
 * Apple 인앱 결제 — 순수 헬퍼(클라·서버·테스트 공용, docs/APPSTORE.md §3.3).
 *  - App Store Server API 응답·Server Notifications V2는 JWS(서명된 JSON)로 온다. 서명 검증 대신
 *    **Apple API를 직접 다시 조회**해 상태를 확정하므로(apple-api.ts), 여기서는 payload만 해독한다.
 *  - 거래가 우리 주문과 맞는지의 판정 규칙을 한 곳에 둔다(purchase.ts·웹훅·cron이 같은 함수).
 */

/** App Store Server API `JWSTransactionDecodedPayload`(필요한 필드만). 시각은 epoch ms. */
export type AppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate?: number;
  /** 'Sandbox'(TestFlight·심사·개발) | 'Production' */
  environment?: string;
  /** 구매 시 클라가 넣은 UUID — 우리 주문번호의 UUID 부분. */
  appAccountToken?: string;
  /** 환불·취소되면 채워진다(epoch ms). */
  revocationDate?: number;
  revocationReason?: number;
  /** 'Consumable' | 'Non-Consumable' | 'Auto-Renewable Subscription' | 'Non-Renewing Subscription' */
  type?: string;
  quantity?: number;
  storefront?: string;
  /** 밀리단위 가격(예: 1500원 → 1500000). 없을 수 있다. */
  price?: number;
  currency?: string;
};

/** JWS(header.payload.signature)의 payload를 JSON으로. 형식이 아니면 null. */
export function decodeJwsPayload<T = unknown>(jws: string): T | null {
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export type AppleTransactionCheck =
  | { ok: true }
  | { ok: false; reason: 'BUNDLE' | 'PRODUCT' | 'ACCOUNT' | 'REVOKED' | 'TYPE' };

/**
 * 거래 ↔ 주문 대조 — 번들·상품·계정 토큰이 모두 맞고 환불되지 않은 소모성 거래만 지급.
 * appAccountToken은 대소문자 무시(Apple이 UUID를 대문자로 돌려주는 경우가 있다).
 */
export function checkAppleTransaction(
  t: AppleTransaction,
  expect: { bundleId: string; productId: string; appAccountToken: string },
): AppleTransactionCheck {
  if (t.bundleId !== expect.bundleId) return { ok: false, reason: 'BUNDLE' };
  if (t.productId !== expect.productId) return { ok: false, reason: 'PRODUCT' };
  if ((t.appAccountToken ?? '').toLowerCase() !== expect.appAccountToken.toLowerCase())
    return { ok: false, reason: 'ACCOUNT' };
  if (t.revocationDate != null) return { ok: false, reason: 'REVOKED' };
  if (t.type && t.type !== 'Consumable') return { ok: false, reason: 'TYPE' };
  return { ok: true };
}

/** 내부 주문번호('ap-<uuid>') → StoreKit appAccountToken(UUID). 형식이 아니면 null. */
export function appleAccountTokenOf(paymentId: string): string | null {
  const m = /^ap-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(paymentId);
  return m ? m[1]!.toLowerCase() : null;
}

/** Sandbox 거래 허용 여부 — 심사·TestFlight 계정(reviewer) 또는 스테이징(env)에서만. */
export function sandboxAllowed(opts: { reviewer: boolean; allowEnv: string | undefined }): boolean {
  return opts.reviewer || opts.allowEnv === '1';
}
