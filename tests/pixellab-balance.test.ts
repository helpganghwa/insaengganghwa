import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { nextResetKst } from '@/lib/game/profile/pixellab-balance';

// KST 기준 날짜(UTC+9) — 2026-09-30 12:00 KST = 03:00 UTC.
const at = (kst: string) => new Date(`${kst}T03:00:00Z`);

describe('Pixellab 월 리셋 날짜', () => {
  it('이번 달 리셋일이 남았으면 이번 달', () => {
    expect(nextResetKst(15, at('2026-09-10'))).toEqual({ date: '2026-09-15', inDays: 5 });
  });
  it('오늘이 리셋일이면 오늘(D-0)', () => {
    expect(nextResetKst(26, at('2026-09-26'))).toEqual({ date: '2026-09-26', inDays: 0 });
  });
  it('지났으면 다음 달, 연말은 다음 해', () => {
    expect(nextResetKst(19, at('2026-09-30'))).toEqual({ date: '2026-10-19', inDays: 19 });
    expect(nextResetKst(15, at('2026-12-20'))).toEqual({ date: '2027-01-15', inDays: 26 });
  });
  it('짧은 달은 말일로', () => {
    expect(nextResetKst(31, at('2027-02-10'))).toEqual({ date: '2027-02-28', inDays: 18 });
  });
});
