import { describe, expect, it } from 'vitest';

import { MILEAGE_KRW_PER_POINT, MILEAGE_PER_MELEE_POINT, POINT_EXCHANGE_DIAMOND, mileageShortfallDiamond } from '@/lib/game/balance';
import { LEGAL_BODY, LEGAL_META } from '@/lib/legal/content';

/**
 * 약관·환불 안내의 포인트 조항(2026-10-06 신설)은 숫자를 글로 적는다 — 적립률·환불 회수 비율이 코드와
 * 어긋나면 고지와 실제 처리가 달라진다. 상수를 바꾸면 여기서 걸려 약관 개정(사전 공지)이 필요함을 알린다.
 */
describe('법률 문서 — 마일리지·대난투 포인트 조항', () => {
  it('적립률과 환불 회수 비율이 코드와 같다', () => {
    const accrual = `${MILEAGE_KRW_PER_POINT}원당 1점`;
    expect(LEGAL_BODY.terms).toContain(accrual);
    expect(LEGAL_BODY.refund).toContain(accrual);
    expect(LEGAL_BODY.refund).toContain(`마일리지 ${MILEAGE_PER_MELEE_POINT}점당 다이아 ${POINT_EXCHANGE_DIAMOND}개`);
    // '10점 미만은 10점으로 올림' — 1점만 모자라도 한 단위를 회수한다.
    expect(LEGAL_BODY.refund).toContain(`${MILEAGE_PER_MELEE_POINT}점 미만은 ${MILEAGE_PER_MELEE_POINT}점으로 올림`);
    expect(mileageShortfallDiamond(1)).toBe(POINT_EXCHANGE_DIAMOND);
  });

  it('환불 시 마일리지 회수, 자정 소멸, 무상 재화 분류를 두 문서가 함께 적는다', () => {
    for (const doc of [LEGAL_BODY.terms, LEGAL_BODY.refund]) {
      expect(doc).toContain('무상 재화로 봅니다');
      expect(doc).toContain('그날 자정(한국 시간)에 소멸');
      expect(doc).toContain('현금으로 환급되지 않');
    }
    expect(LEGAL_BODY.terms).toContain('그 결제로 쌓인 마일리지도 함께 회수');
  });

  it('두 문서의 시행일이 같고, 약관 부칙의 날짜와 일치한다', () => {
    expect(LEGAL_META.terms.effectiveDate).toBe(LEGAL_META.refund.effectiveDate);
    expect(LEGAL_BODY.terms).toContain(`시행일: ${LEGAL_META.terms.effectiveDate}`);
  });
});
