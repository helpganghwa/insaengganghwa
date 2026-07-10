import { describe, expect, it } from 'vitest';

import { hasReservedWord, validateNickname } from '@/lib/game/nickname';

describe('validateNickname — 예약어(사칭 방지)', () => {
  it('운영 주체 사칭 단어는 부분 일치로 차단', () => {
    for (const n of ['운영자', '김운영자', '운영자님', '관리자1', '갓개발자', '공식계정', '시스템']) {
      expect(validateNickname(n).ok, n).toBe(false);
    }
  });

  it('영문 예약어는 대소문자 무관 차단', () => {
    for (const n of ['admin', 'ADMIN', 'AdMiN1', 'staff2', 'System', 'OFFICIAL']) {
      expect(validateNickname(n).ok, n).toBe(false);
    }
  });

  it('짧은 토큰(gm·cs·bot)은 전체 일치만 차단 — 부분 포함은 허용', () => {
    expect(validateNickname('GM').ok).toBe(false);
    expect(validateNickname('bot').ok).toBe(false);
    // 부분 포함 오차단 방지 — kingman1에 gm, csoul에 cs가 들어 있어도 통과.
    expect(validateNickname('kingman1').ok).toBe(true);
    expect(hasReservedWord('kingman1')).toBe(false);
    expect(hasReservedWord('csoul')).toBe(false);
  });

  it('정상 닉네임은 통과', () => {
    for (const n of ['강화왕', 'Hero123', '망치질장인']) {
      expect(validateNickname(n).ok, n).toBe(true);
    }
  });

  it('기존 규칙(문자·길이) 유지', () => {
    expect(validateNickname('a').ok).toBe(false); // 최소 2자
    expect(validateNickname('아주긴닉네임이야요').ok).toBe(false); // 최대 8자
    expect(validateNickname('nick name').ok).toBe(false); // 공백
    expect(validateNickname('닉😀').ok).toBe(false); // 이모지
  });
});
