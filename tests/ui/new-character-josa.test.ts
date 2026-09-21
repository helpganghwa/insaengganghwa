import { readFileSync } from 'node:fs';
import { getJosaPicker } from 'josa';
import { describe, expect, it } from 'vitest';

/**
 * 새 서버 확인 화면의 '(으)로'(2026-09-21) — 닉네임·서버 이름은 실행 시점에 정해지므로 조사를 고정하면
 * 틀린다("치즈으로"). josa 패키지에 맡긴다: ㄹ받침·숫자 발음·로마자까지 처리한다.
 * (es-hangul의 josa는 숫자·영문 낱말을 받침 없음으로 봐서 "대장장이1043로"·"Kim로"가 된다 — 여기엔 쓰지 않는다.)
 */
const PAGE = readFileSync(new URL('../../app/login/new-character/page.tsx', import.meta.url), 'utf8');
const CHOICE = readFileSync(new URL('../../app/login/new-character/NewCharacterChoice.tsx', import.meta.url), 'utf8');

describe("새 서버 확인 화면의 '(으)로'", () => {
  it('조사를 고정하지 않고 josa에 맡긴다', () => {
    for (const src of [PAGE, CHOICE]) {
      expect(src).toContain("getJosaPicker('으로')");
      expect(src).not.toMatch(/\}(<\/b>)?(으로|로) /);
    }
  });

  it('우리가 기대하는 경우를 josa가 맞게 고른다', () => {
    const ro = getJosaPicker('으로');
    expect(ro('치즈')).toBe('로');
    expect(ro('서울')).toBe('로'); // ㄹ받침
    expect(ro('치즈스틱')).toBe('으로');
    expect(ro('2서버')).toBe('로');
    expect(ro('대장장이1043')).toBe('으로'); // 삼
    expect(ro('대장장이1041')).toBe('로'); // 일(ㄹ받침)
    expect(ro('SEB')).toBe('로');
  });
});
