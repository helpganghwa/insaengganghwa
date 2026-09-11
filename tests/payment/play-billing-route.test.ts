import { describe, expect, it } from 'vitest';

import { usePlayBilling } from '@/lib/platform-client';
import { digitalGoodsAvailable } from '@/app/(game)/shop/play-checkout';

/**
 * 결제 경로 판정 — 앱=Play 결제, 웹·PWA=포트원.
 * 회귀 방지 대상은 "쿠키 단독 판정"이다. TWA는 크롬과 저장소를 공유해 앱을 한 번 열면 같은 기기의
 * 브라우저 탭에도 ig_platform이 남는다. 쿠키만 보면 그 탭에서 포트원 결제가 통째로 막힌다.
 */
describe('usePlayBilling', () => {
  it('Digital Goods 서비스가 실제로 열리면 Play 결제 — 앱 안이라는 확실한 증거', () => {
    expect(usePlayBilling({ hasDigitalGoods: true, twaCookie: true, standalone: true })).toBe(true);
    // 쿠키가 지워졌어도(저장소 정리 등) 서비스가 열리면 앱이다.
    expect(usePlayBilling({ hasDigitalGoods: true, twaCookie: false, standalone: true })).toBe(true);
  });

  it('브라우저 탭은 쿠키가 새어 들어와도 포트원 — 모바일 웹 결제가 막히면 안 된다', () => {
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: true, standalone: false })).toBe(false);
  });

  it('웹·PWA(쿠키 없음)는 포트원', () => {
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: false, standalone: false })).toBe(false);
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: false, standalone: true })).toBe(false);
  });

  it('앱 표식 + standalone인데 API가 없으면 Play 경로로 보내 안내로 끝낸다 — 포트원 노출은 정책 위반', () => {
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: true, standalone: true })).toBe(true);
  });

  it('앱 세션 표식이 있으면 standalone이 아니어도 Play 경로 — 커스텀탭 폴백에서 포트원이 열리면 안 된다', () => {
    // 도메인 검증 실패로 앱이 주소창 있는 커스텀탭으로 뜨는 경우. standalone이 아니라
    // 종전 안전망(쿠키 AND standalone)은 이 상황을 놓쳤다(2026-09-11 전수조사).
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: true, standalone: false, appSession: true })).toBe(true);
  });

  it('세션 표식은 탭마다 독립이라 브라우저 탭에는 없다 — 쿠키만 새어 들어와도 포트원 유지', () => {
    expect(usePlayBilling({ hasDigitalGoods: false, twaCookie: true, standalone: false, appSession: false })).toBe(false);
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
