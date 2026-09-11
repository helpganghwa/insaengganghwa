import { describe, expect, it } from 'vitest';

import { usePlayBilling } from '@/lib/platform-client';

/**
 * 결제 경로 판정 — 앱=Play 결제, 웹·PWA=포트원.
 * 회귀 방지 대상은 "쿠키 단독 판정"이다. TWA는 크롬과 저장소를 공유해 앱을 한 번 열면 같은 기기의
 * 브라우저 탭에도 ig_platform이 남는다. 쿠키만 보면 그 탭에서 포트원 결제가 통째로 막힌다.
 */
describe('usePlayBilling', () => {
  it('Digital Goods API가 있으면 Play 결제 — 앱 안이라는 확실한 증거', () => {
    expect(usePlayBilling({ hasDigitalGoods: true, twaCookie: true, standalone: true })).toBe(true);
    // 쿠키가 지워졌어도(저장소 정리 등) API가 있으면 앱이다.
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
