import { describe, expect, it } from 'vitest';

import { expeditionAsBonusBp } from '@/lib/game/balance';
import { applyMultiplier, asBonusBp, avatarEnhanceSum } from '@/lib/game/expedition/engine';

describe('expedition — 아바타 강화 합 배율(§3.3)', () => {
  it('아바타 강화 합 — 스냅샷 3종의 현재 레벨 합, 미보유·기본 아바타 0', () => {
    const lv = new Map([['a', 120], ['b', 80], ['c', 100], ['d', 999]]);
    expect(avatarEnhanceSum({ weaponKey: 'a', armorKey: 'b', accessoryKey: 'c' }, lv)).toBe(300);
    expect(avatarEnhanceSum({ weaponKey: 'a', armorKey: 'zzz', accessoryKey: 'c' }, lv)).toBe(220);
    expect(avatarEnhanceSum(null, lv)).toBe(0);
    expect(avatarEnhanceSum({}, lv)).toBe(0);
  });

  it('배율 M(AS) = 1 + 1.5×(AS/1000)^0.9 — 상한 없이 단조 증가, 문서 표와 일치', () => {
    expect(expeditionAsBonusBp(0)).toBe(0);
    const tbl: [number, number][] = [[100, 1.19], [300, 1.51], [666, 2.04], [1000, 2.5], [1500, 3.16], [2000, 3.8]];
    for (const [a, m] of tbl) expect(1 + expeditionAsBonusBp(a) / 10000).toBeCloseTo(m, 2);
    let prev = 0;
    for (const a of [10, 50, 200, 800, 1500, 4000, 10000]) {
      const b = asBonusBp(a);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
  });

  it('배율 합산 — 시너지+레벨+강화 합이 bp로 더해져 수량에만 적용', () => {
    const r = applyMultiplier({ kind: 'dia', diamond: 100 }, 1000 + 500 + asBonusBp(1000));
    // 1 + 0.10 + 0.05 + 1.50 = 2.65
    expect(r.diamond).toBe(265);
  });
});
