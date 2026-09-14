import { describe, expect, it } from 'vitest';

import { classifyPaymentFailure } from '@/lib/payment/failure-reason';

/**
 * 결제 실패 사유 분류 — 2026-09-13 실서버 오경보 4건이 계기.
 * 헤이론·글라시안·도헤는 실패 경보가 울린 뒤 1~4분 안에 같은 금액을 결제 성공시켰다(= 단순 이탈).
 * 핵심 원칙 두 가지: (1) 유저 이탈은 조용히 넘긴다 (2) **모르면 진짜 오류로 본다**(fail-safe).
 */
describe('classifyPaymentFailure', () => {
  it('PG 코드가 취소 코드면 유저 이탈', () => {
    for (const pgCode of ['USER_CANCEL', 'PAY_PROCESS_CANCELED', 'V001', 'user_cancel']) {
      expect(classifyPaymentFailure({ pgCode }).userCancelled).toBe(true);
    }
  });

  it('한국어 취소 문구를 잡는다', () => {
    for (const pgMessage of [
      '사용자가 결제를 취소하였습니다',
      '고객 취소',
      '사용자 중단',
      '이용자가 결제를 중단했습니다',
      '결제창을 닫았습니다',
    ]) {
      expect(classifyPaymentFailure({ pgMessage }).userCancelled).toBe(true);
    }
  });

  it('영문 취소 문구를 잡는다', () => {
    expect(classifyPaymentFailure({ reason: 'Payment cancelled by user' }).userCancelled).toBe(true);
    expect(classifyPaymentFailure({ pgMessage: 'USER_CANCEL' }).userCancelled).toBe(true);
  });

  it('진짜 결제 오류는 이탈로 보지 않는다', () => {
    for (const f of [
      { pgMessage: '한도초과' },
      { pgMessage: '카드사 점검중입니다' },
      { pgCode: 'PG_PROVIDER_ERROR', pgMessage: '가맹점 미등록' },
      { reason: '잔액 부족' },
      { pgMessage: '유효하지 않은 카드번호' },
    ]) {
      expect(classifyPaymentFailure(f).userCancelled).toBe(false);
    }
  });

  it('행위자 없는 취소 종결형은 이탈로 보지 않는다 — PG·카드사 측 취소가 경보를 못 삼키게(2026-09-14)', () => {
    for (const pgMessage of [
      '카드사에서 승인이 취소되었습니다',
      '한도 초과로 거래가 취소되었습니다',
      '결제가 취소되었습니다', // 누가 취소했는지 모름 → 오류로
      '기한 만료로 자동 취소됨',
      '승인 거절: 정지된 카드',
    ]) {
      expect(classifyPaymentFailure({ pgMessage }).userCancelled).toBe(false);
    }
  });

  it("'취소 불가' 류는 취소가 아니다 — 이게 없으면 진짜 오류가 묻힌다", () => {
    expect(classifyPaymentFailure({ pgMessage: '취소할 수 없는 거래입니다' }).userCancelled).toBe(false);
    expect(classifyPaymentFailure({ pgMessage: '결제 취소 실패' }).userCancelled).toBe(false);
    expect(classifyPaymentFailure({ pgMessage: 'cancel failed' }).userCancelled).toBe(false);
  });

  it('사유를 하나도 못 받으면 진짜 오류로 본다(fail-safe)', () => {
    expect(classifyPaymentFailure(null).userCancelled).toBe(false);
    expect(classifyPaymentFailure({}).userCancelled).toBe(false);
    expect(classifyPaymentFailure({ reason: '', pgCode: '', pgMessage: '' }).userCancelled).toBe(false);
    expect(classifyPaymentFailure(null).summary).toContain('사유 미상');
  });

  it('요약에 코드와 문구가 함께 들어간다', () => {
    const v = classifyPaymentFailure({ pgCode: 'PG_X', pgMessage: '한도초과' });
    expect(v.summary).toContain('PG_X');
    expect(v.summary).toContain('한도초과');
  });
});
