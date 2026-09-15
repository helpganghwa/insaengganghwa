import { describe, expect, it } from 'vitest';

import { CHRONICLE_MAX_TOKENS, chronicleMaxTokens, isNotable, type ConquestDaySummary } from '@/lib/game/guild/conquest/chronicle';

/** 연대기 초안 출력 상한(2026-09-15) — 잘림 횟수에 따라 계단식 상향, 마지막 값에서 고정. */
describe('chronicleMaxTokens', () => {
  it('기본 3,200 → 잘릴 때마다 한 단계 상향, 끝에서 고정', () => {
    expect(chronicleMaxTokens(0)).toBe(3200);
    expect(chronicleMaxTokens(1)).toBe(4200);
    expect(chronicleMaxTokens(2)).toBe(5200);
    expect(chronicleMaxTokens(9)).toBe(CHRONICLE_MAX_TOKENS[CHRONICLE_MAX_TOKENS.length - 1]);
  });
  it('종전 상한(2,200)보다 항상 크다 — 09-15 점령 14건 본문(약 2,080자 잘림)이 첫 시도에 들어가야 한다', () => {
    expect(chronicleMaxTokens(0)).toBeGreaterThan(2200);
  });
});

describe('isNotable', () => {
  const empty: ConquestDaySummary = {
    captures: [], defenses: [], feats: [], disbands: [], neutralized: [],
  } as unknown as ConquestDaySummary;
  it('점령·활약·해산·중립화가 전부 없으면 기록하지 않는다', () => {
    expect(isNotable(empty)).toBe(false);
  });
  it('점령 1건이면 기록', () => {
    expect(isNotable({ ...empty, captures: [{ zone: 'z', region: 'r', winner: 'A', from: null, firstCapture: true, defenders: 0, deployedDefenders: 0 }] })).toBe(true);
  });
});
