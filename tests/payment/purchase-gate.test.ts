import { describe, expect, it } from 'vitest';

import { isKnownMinor, purchaseGate } from '@/lib/payment/purchase-gate';

const LIMIT = 70_000;
const base = { verified: false, isMinor: false, reviewer: false, monthlyKrw: 0, krw: 1500, limitKrw: LIMIT };

/**
 * 본인확인은 웹에서만 요구한다(2026-09-12 사용자 결정).
 * 회귀 방지 대상은 **미인증을 미성년으로 단정하는 것**이다 — 앱은 본인확인을 요구하지 않으므로
 * 미인증 = 나이를 모름이고, 모름을 미성년으로 보면 누적 한도를 넘긴 성인이 결제는 되고 지급만 막힌다.
 */
describe('purchaseGate', () => {
  it('웹 미인증은 본인확인을 요구한다', () => {
    expect(purchaseGate({ ...base, channel: 'portone' })).toBe('IDENTITY_REQUIRED');
  });

  it('앱은 미인증이어도 그대로 결제한다 — Google 계정이 연령·자녀 보호를 관리한다', () => {
    expect(purchaseGate({ ...base, channel: 'play' })).toBe('ok');
  });

  it('앱 미인증은 누적이 한도를 넘어도 막지 않는다 — 나이를 모르는 것이지 미성년이 아니다', () => {
    // ← 회귀 지점: 여기서 MINOR_LIMIT이 나오면 결제는 되고 지급만 막힌다.
    expect(purchaseGate({ ...base, channel: 'play', monthlyKrw: 69_000, krw: 13_000 })).toBe('ok');
  });

  it('본인확인으로 확인된 미성년은 구매처와 무관하게 한도를 적용한다', () => {
    const minor = { ...base, verified: true, isMinor: true, monthlyKrw: 69_000, krw: 13_000 };
    expect(purchaseGate({ ...minor, channel: 'portone' })).toBe('MINOR_LIMIT');
    expect(purchaseGate({ ...minor, channel: 'play' })).toBe('MINOR_LIMIT');
  });

  it('한도 이내면 미성년도 통과하고, 경계는 초과부터 막는다', () => {
    const minor = { ...base, verified: true, isMinor: true };
    expect(purchaseGate({ ...minor, channel: 'play', monthlyKrw: 68_500, krw: 1_500 })).toBe('ok'); // 정확히 한도
    expect(purchaseGate({ ...minor, channel: 'play', monthlyKrw: 68_500, krw: 1_501 })).toBe('MINOR_LIMIT');
  });

  it('확인된 성인은 누적이 커도 통과한다', () => {
    expect(
      purchaseGate({ ...base, channel: 'portone', verified: true, isMinor: false, monthlyKrw: 900_000, krw: 68_000 }),
    ).toBe('ok');
  });

  it('심사 계정은 본인확인·한도 모두 면제 — 카드사·스토어 심사 검수용', () => {
    expect(purchaseGate({ ...base, channel: 'portone', reviewer: true })).toBe('ok');
    expect(
      purchaseGate({ ...base, channel: 'portone', reviewer: true, verified: true, isMinor: true, monthlyKrw: 99_000 }),
    ).toBe('ok');
  });
});

describe('isKnownMinor', () => {
  it('본인확인을 거친 미성년만 참', () => {
    expect(isKnownMinor(true, true)).toBe(true);
    expect(isKnownMinor(true, false)).toBe(false);
    // 미인증은 나이를 모르는 상태다 — 미성년으로 단정하지 않는다.
    expect(isKnownMinor(false, true)).toBe(false);
    expect(isKnownMinor(false, false)).toBe(false);
  });
});
