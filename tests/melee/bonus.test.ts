import { describe, expect, it } from 'vitest';

import { MELEE_DEFENSE_BOX, MELEE_KILL_DIAMOND, meleeBonus } from '@/lib/game/balance';

/** 대난투 공격·방어 보너스(0192) — 공시 수치와 1:1. */
describe('melee/bonus', () => {
  it('처치 → 다이아, 방어 성공 → 상자, 음수는 0 처리', () => {
    expect(meleeBonus(0, 0)).toEqual({ diamond: 0, boxes: 0 });
    expect(meleeBonus(2, 3)).toEqual({ diamond: 2 * MELEE_KILL_DIAMOND, boxes: 3 * MELEE_DEFENSE_BOX });
    expect(meleeBonus(-1, 5)).toEqual({ diamond: 0, boxes: 5 * MELEE_DEFENSE_BOX });
  });
  it('확정 단가: 처치 💎20 · 방어 성공 📦1 (실서버 하루 891·839 → 💎17,820 · 📦839)', () => {
    expect(MELEE_KILL_DIAMOND).toBe(20);
    expect(MELEE_DEFENSE_BOX).toBe(1);
    expect(meleeBonus(891, 839)).toEqual({ diamond: 17_820, boxes: 839 });
  });
});
