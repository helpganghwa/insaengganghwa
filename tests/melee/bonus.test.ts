import { describe, expect, it } from 'vitest';

import { MELEE_DEFENSE_DIAMOND, MELEE_KILL_DIAMOND, meleeBonusDiamond } from '@/lib/game/balance';

/** 대난투 공격·방어 성공 보너스(0192) — 공시 수치와 1:1. */
describe('melee/bonus', () => {
  it('처치·방어 성공 횟수 × 단가, 음수는 0 처리', () => {
    expect(meleeBonusDiamond(0, 0)).toBe(0);
    expect(meleeBonusDiamond(2, 3)).toBe(2 * MELEE_KILL_DIAMOND + 3 * MELEE_DEFENSE_DIAMOND);
    expect(meleeBonusDiamond(-1, 5)).toBe(5 * MELEE_DEFENSE_DIAMOND);
  });
  it('하루 규모: 처치 850·방어 850이면 5,100💎 안팎', () => {
    expect(meleeBonusDiamond(850, 850)).toBe(5_100);
  });
});
