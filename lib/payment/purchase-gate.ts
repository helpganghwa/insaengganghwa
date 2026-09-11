/**
 * 결제 전 청소년 보호 게이트(순수) — 본인확인 요구와 미성년 월 한도.
 *
 * DB를 읽는 쪽(purchase.ts)과 분리해 규칙만 남긴다. 주문 생성과 지급 두 곳이 **같은 규칙**을
 * 써야 하기 때문이다. 두 곳이 어긋나면 결제는 되고 지급만 막히는 사고가 난다(2026-09-12).
 */

/** 결제 경로 — 본인확인 요구가 경로마다 다르다. */
export type PurchaseChannel = 'portone' | 'play';

/**
 * 월 한도를 적용할 미성년인가 — **본인확인으로 확인된 경우만** 참.
 *
 * ⚠ 미인증을 미성년으로 단정하면 안 된다. 웹은 미인증을 애초에 막으므로 여기 오면 늘 확인된
 * 상태지만, 앱(Google Play)은 본인확인을 요구하지 않으므로 미인증 = **나이를 모름**이다.
 * 모름을 미성년으로 취급하면 누적 한도를 넘긴 성인이 결제는 되고 지급만 막힌다.
 */
export function isKnownMinor(verified: boolean, isMinor: boolean): boolean {
  return verified && isMinor;
}

export type PurchaseGateResult = 'ok' | 'IDENTITY_REQUIRED' | 'MINOR_LIMIT';

/**
 * 주문 생성 시점 게이트.
 *
 * 본인확인은 **웹(포트원)에서만** 요구한다(2026-09-12 사용자 결정) — 앱은 Google 계정이 연령과
 * 결제수단·자녀 보호를 이미 관리하고, 그 위에 국내 본인확인을 또 요구하면 구매를 누른 순간 앱이
 * 통째로 인증 페이지로 바뀐다. 심사 계정은 두 가지 모두 면제한다.
 */
export function purchaseGate(f: {
  channel: PurchaseChannel;
  /** 본인확인 이력이 있는가. */
  verified: boolean;
  /** 본인확인 결과가 미성년인가(미인증이면 의미 없음 — isKnownMinor 참조). */
  isMinor: boolean;
  reviewer: boolean;
  /** 이번 달(KST) 누적 결제액(원). */
  monthlyKrw: number;
  /** 이번 주문 금액(원). */
  krw: number;
  /** 미성년 월 한도(원). */
  limitKrw: number;
}): PurchaseGateResult {
  if (f.reviewer) return 'ok';
  if (f.channel === 'portone' && !f.verified) return 'IDENTITY_REQUIRED';
  if (isKnownMinor(f.verified, f.isMinor) && f.monthlyKrw + f.krw > f.limitKrw) return 'MINOR_LIMIT';
  return 'ok';
}
