import { describe, expect, it } from 'vitest';

import {
  EXPEDITION_REQ_K_BP,
  EXPEDITION_REQ_K_BP_SLOT1,
  EXPEDITION_REQ_MET_BONUS_BP,
  EXPEDITION_REQ_MIN_BASE,
  expeditionAsBonusBp,
} from '@/lib/game/balance';
import {
  applyMultiplier,
  asBonusBp,
  avatarEnhanceSum,
  reqMetBonusBp,
  rollMission,
  rollRequiredSum,
  type Rng10k,
} from '@/lib/game/expedition/engine';

/** 결정론 RNG — 큐를 순서대로 소비, 비면 0. */
const seq = (vals: number[]): Rng10k => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

describe('expedition — 아바타 강화 합·권장 강화 합(§3.3)', () => {
  it('권장 R = round₁₀(B × k), k 균등(1번 슬롯은 {0.5,0.7}), B<30이면 0, 상한 없음', () => {
    expect(rollRequiredSum(seq([0]), 29, 2)).toBe(0);
    expect(rollRequiredSum(seq([0]), 1000, 2)).toBe(500);
    expect(rollRequiredSum(seq([1]), 1000, 2)).toBe(700);
    expect(rollRequiredSum(seq([2]), 1000, 2)).toBe(900);
    expect(rollRequiredSum(seq([3]), 1000, 2)).toBe(1100);
    expect(rollRequiredSum(seq([2]), 1000, 1)).toBe(500);
    expect(rollRequiredSum(seq([1]), 1000, 1)).toBe(700);
    expect(rollRequiredSum(seq([3]), 123, 2)).toBe(140);
    expect(rollRequiredSum(seq([3]), 5000, 2)).toBe(5500);
    expect(EXPEDITION_REQ_K_BP).toEqual([5000, 7000, 9000, 11000]);
    expect(EXPEDITION_REQ_K_BP_SLOT1).toEqual([5000, 7000]);
    expect(EXPEDITION_REQ_MIN_BASE).toBe(30);
  });

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

  it('권장 달성 보너스 — R>0이고 AS≥R일 때만 +15%, 미달·권장치 없음은 0(페널티 없음)', () => {
    expect(reqMetBonusBp(300, 300)).toBe(EXPEDITION_REQ_MET_BONUS_BP);
    expect(reqMetBonusBp(299, 300)).toBe(0);
    expect(reqMetBonusBp(500, 0)).toBe(0);
    expect(EXPEDITION_REQ_MET_BONUS_BP).toBe(1500);
  });

  it('rollMission — baseSum·slot을 받아 requiredSum을 싣고, 생략 시 0(레거시 호출 호환)', () => {
    const m = rollMission(() => 3, 0, 1000, 2); // k 인덱스 3 → 1.1
    expect(m.requiredSum).toBe(1100);
    expect(rollMission(seq([0]), 0).requiredSum).toBe(0);
  });

  it('배율 합산 — 시너지+레벨+강화 합+달성 보너스가 bp로 더해져 수량에만 적용', () => {
    const r = applyMultiplier({ kind: 'dia', diamond: 100 }, 1000 + 500 + asBonusBp(1000) + reqMetBonusBp(1000, 900));
    // 1 + 0.10 + 0.05 + 1.50 + 0.15 = 2.80
    expect(r.diamond).toBe(280);
  });
});
