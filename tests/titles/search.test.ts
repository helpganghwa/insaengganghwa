import { describe, expect, it } from 'vitest';

import { TITLE_DEFS } from '@/lib/game/titles/defs';
import { TITLE_SEARCH_MAX, normalizeTitleQuery, splitTitleMatch, titleNameMatches } from '@/lib/game/titles/search';

describe('칭호 이름 검색(search.ts)', () => {
  it('띄어쓰기·대소문자를 무시해 이름만 본다', () => {
    expect(titleNameMatches('불의 정점', normalizeTitleQuery('불의정점'))).toBe(true);
    expect(titleNameMatches('PUMPKIN KING', normalizeTitleQuery('pumpkin k'))).toBe(true);
    expect(titleNameMatches('불의 정점', normalizeTitleQuery(' 정점 '))).toBe(true);
    expect(titleNameMatches('불의 정점', normalizeTitleQuery('레이드'))).toBe(false);
    expect(titleNameMatches('아무거나', '')).toBe(true);
  });

  it('실제 정의에서 "불"은 이름에 든 것만 찾는다(조건·분류는 범위 밖)', () => {
    const nq = normalizeTitleQuery('불');
    const hits = TITLE_DEFS.filter((d) => titleNameMatches(d.label, nq));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((d) => d.label.includes('불'))).toBe(true);
    // 분류명으로는 안 찾힌다 — '레이드'를 이름에 쓴 칭호는 없다.
    expect(TITLE_DEFS.filter((d) => titleNameMatches(d.label, normalizeTitleQuery('레이드')))).toHaveLength(0);
  });

  it('강조 분할은 원문에 그대로 있을 때만', () => {
    expect(splitTitleMatch('꺼지지 않는 불', '불')).toEqual(['꺼지지 않는 ', '불', '']);
    expect(splitTitleMatch('PUMPKIN KING', 'king')).toEqual(['PUMPKIN ', 'KING', '']);
    expect(splitTitleMatch('불의 정점', '불의정점')).toBeNull();
    expect(splitTitleMatch('불의 정점', '')).toBeNull();
    expect(splitTitleMatch('불의 정점', '탑')).toBeNull();
  });

  it('검색어 상한은 20자', () => {
    expect(TITLE_SEARCH_MAX).toBe(20);
  });
});
