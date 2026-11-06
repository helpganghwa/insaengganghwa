import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { TITLE_SECRET_BY_CODE } from '@/lib/game/titles/defs.server';

// 업데이트 18(2026-11-06) — 칭호 랭킹 1위 '명불허전' + 육관왕 → 칠관왕(랭킹 7종).
describe('칭호 랭킹 칭호', () => {
  it('명불허전: 랭킹 1위 조건부, 장미 불꽃 전체, 8자 이하', () => {
    const d = TITLE_BY_CODE.get('rank_titles')!;
    expect(d.label).toBe('명불허전');
    expect(d.kind).toBe('conditional');
    expect(d.cat).toBe('랭킹 1위');
    expect(d.style.fx).toBe('blazerose');
    expect(d.style.fxOnly).toBeUndefined();
    expect(Array.from(d.label).length).toBeLessThanOrEqual(8);
    expect(TITLE_SECRET_BY_CODE.get('rank_titles')?.cond).toBe('칭호 랭킹 1위인 동안');
  });
  it('칠관왕: 이름과 조건 글이 7종 기준', () => {
    expect(TITLE_BY_CODE.get('pentagon')!.label).toBe('칠관왕');
    expect(TITLE_SECRET_BY_CODE.get('pentagon')?.cond).toContain('7종');
    expect(TITLE_SECRET_BY_CODE.get('uncrowned')?.cond).toContain('7종');
  });
});
