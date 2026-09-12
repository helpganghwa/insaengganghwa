import { describe, expect, it } from 'vitest';

import { usePlayBilling } from '@/lib/platform-client';
import { digitalGoodsAvailable } from '@/app/(game)/shop/play-checkout';

/**
 * 결제 경로 판정 — 앱=Play 결제, 웹·PWA=포트원.
 * 판정 근거는 둘뿐이다: Digital Goods 서비스가 실제로 열리는가, 앱 세션 표식이 있는가.
 * ig_platform 쿠키는 TWA와 크롬이 저장소를 공유해 같은 기기의 브라우저 탭·PWA로 새므로 쓰지 않는다.
 */
describe('usePlayBilling', () => {
  it('Digital Goods 서비스가 실제로 열리면 Play 결제 — 앱 안이라는 확실한 증거', () => {
    expect(usePlayBilling({ hasDigitalGoods: true })).toBe(true);
    expect(usePlayBilling({ hasDigitalGoods: true, appSession: false })).toBe(true);
  });

  it('웹·PWA는 포트원', () => {
    expect(usePlayBilling({ hasDigitalGoods: false })).toBe(false);
    expect(usePlayBilling({ hasDigitalGoods: false, appSession: false })).toBe(false);
  });

  it('앱 세션 표식이 있으면 API가 없어도 Play 경로 — 커스텀탭 폴백에서 포트원이 열리면 안 된다', () => {
    // 도메인 검증 실패로 앱이 주소창 있는 커스텀탭으로 뜨는 경우. Digital Goods가 없어도
    // 포트원을 열면 구글 정책 위반이라 Play 경로로 보내 안내로 끝낸다.
    expect(usePlayBilling({ hasDigitalGoods: false, appSession: true })).toBe(true);
  });

  // 2026-09-12 — 같은 기기에 홈 화면 PWA와 앱을 둘 다 두면 PWA에도 ig_platform 쿠키가 남고
  // PWA도 standalone이다. 종전 안전망(쿠키 && standalone)이 그 PWA의 결제를 통째로 막았는데,
  // 정작 PWA는 Play 결제를 쓸 수 없어 아무 경로도 남지 않았다. 쿠키·standalone은 이제 안 본다.
  it('쿠키·standalone은 더 이상 판정에 쓰지 않는다 — PWA 결제가 막히면 안 된다', () => {
    const pwaWithLeakedCookie = { hasDigitalGoods: false, appSession: false };
    expect(usePlayBilling(pwaWithLeakedCookie)).toBe(false);
  });
});

/**
 * 사실 수집 회귀(2026-09-12) — 규칙이 아니라 **hasDigitalGoods를 구하는 방법**이 틀렸던 사고.
 *
 * 안드로이드 크롬은 일반 탭에서도 getDigitalGoodsService를 노출한다. 존재만 보고 앱으로 판정해
 * 모바일 웹 유저가 전부 Play 결제로 갈렸고, 호출하면 "unsupported context"로 reject돼 결제가
 * 통째로 실패했다(실패 주문 19건·성공 0건, 09-11 16:01 ~ 09-12).
 */
describe('digitalGoodsAvailable', () => {
  const opens = async () => ({});
  const rejects = async () => {
    throw new Error('unsupported context');
  };

  it('함수가 있어도 열리지 않으면 false — 안드로이드 크롬 일반 탭', async () => {
    expect(await digitalGoodsAvailable({ getDigitalGoodsService: rejects, PaymentRequest: function () {} })).toBe(false);
  });

  it('실제로 열리면 true — 앱(TWA) 안', async () => {
    expect(await digitalGoodsAvailable({ getDigitalGoodsService: opens, PaymentRequest: function () {} })).toBe(true);
  });

  it('API 자체가 없으면 false — iOS·데스크톱', async () => {
    expect(await digitalGoodsAvailable({ PaymentRequest: function () {} })).toBe(false);
  });

  it('PaymentRequest가 없으면 열려도 결제할 수 없다', async () => {
    expect(await digitalGoodsAvailable({ getDigitalGoodsService: opens })).toBe(false);
  });
});
