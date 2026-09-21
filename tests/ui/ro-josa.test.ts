import { describe, expect, it } from 'vitest';

import { roJosa } from '@/lib/korean/ro';

describe("'(으)로' 고르기", () => {
  it('받침 없음·ㄹ받침은 로, 그 밖의 받침은 으로', () => {
    expect(roJosa('치즈')).toBe('로');
    expect(roJosa('서울')).toBe('로');
    expect(roJosa('치즈스틱')).toBe('으로');
    expect(roJosa('2서버')).toBe('로');
    expect(roJosa('불꽃')).toBe('으로');
  });
  it('숫자는 발음, 로마자는 표기 관례로', () => {
    expect(roJosa('대장장이1043')).toBe('으로'); // 삼
    expect(roJosa('대장장이1041')).toBe('로'); // 일(ㄹ받침)
    expect(roJosa('대장장이1042')).toBe('로'); // 이
    // 대문자 끝 = 약어(글자 이름): 씨비티·에스이비는 '로', 엠·엔만 '으로'
    expect(roJosa('CBT')).toBe('로');
    expect(roJosa('SEB')).toBe('로');
    expect(roJosa('NPM')).toBe('으로');
    // 소문자 끝 = 낱말
    expect(roJosa('Kim')).toBe('으로');
    expect(roJosa('Bob')).toBe('으로');
    expect(roJosa('Rael')).toBe('로');
    expect(roJosa('Mia')).toBe('로');
  });
  it('판정할 수 없으면 로', () => {
    expect(roJosa('')).toBe('로');
    expect(roJosa('별★')).toBe('로');
  });
});
