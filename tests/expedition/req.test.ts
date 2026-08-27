import { describe, expect, it } from 'vitest';

import {
  EXPEDITION_REQ_K_BP,
  EXPEDITION_REQ_K_BP_SLOT1,
  EXPEDITION_REQ_MIN_BASE,
  expeditionReqBonusBp,
} from '@/lib/game/balance';
import {
  applyMultiplier,
  avatarEnhanceSum,
  reqBonusBp,
  rollMission,
  rollRequiredSum,
  type Rng10k,
} from '@/lib/game/expedition/engine';

/** 결정론 RNG — 큐를 순서대로 소비, 비면 0. */
const seq = (vals: number[]): Rng10k => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

describe('expedition — 필요 강화 합(§3.3)', () => {
  it('R = round₁₀(B × k), k 균등(1번 슬롯은 {0.5,0.7}), B<30이면 0, 상한 없음', () => {
    expect(rollRequiredSum(seq([0]), 29, 2)).toBe(0);
    // slot 2: k 인덱스 0..3 → 0.5/0.7/0.9/1.1
    expect(rollRequiredSum(seq([0]), 1000, 2)).toBe(500);
    expect(rollRequiredSum(seq([1]), 1000, 2)).toBe(700);
    expect(rollRequiredSum(seq([2]), 1000, 2)).toBe(900);
    expect(rollRequiredSum(seq([3]), 1000, 2)).toBe(1100);
    // slot 1: 0.5/0.7만
    expect(rollRequiredSum(seq([2]), 1000, 1)).toBe(500);
    expect(rollRequiredSum(seq([1]), 1000, 1)).toBe(700);
    // 10 단위 반올림 · 상한 없음(B 5,000 → 5,500)
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

  it('배율 M(R) = 1 + 0.9×(R/1000)^0.8 — 상한 없이 단조 증가, 문서 표와 일치', () => {
    expect(expeditionReqBonusBp(0)).toBe(0);
    const tbl: [number, number][] = [[100, 1.14], [300, 1.34], [600, 1.60], [1000, 1.90], [2000, 2.57], [3000, 3.17]];
    for (const [r, m] of tbl) expect(1 + expeditionReqBonusBp(r) / 10000).toBeCloseTo(m, 2);
    let prev = 0;
    for (const r of [10, 50, 200, 800, 1500, 4000, 10000]) {
      const b = reqBonusBp(r);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
  });

  it('rollMission — baseSum·slot을 받아 requiredSum을 싣고, 생략 시 0(레거시 호출 호환)', () => {
    // rng 소비 순서: region, difficulty, kind, 수량(1~2회)…, 마지막에 requiredSum k.
    const m = rollMission(() => 3, 0, 1000, 2); // k 인덱스 3 → 1.1
    expect(m.requiredSum).toBe(1100);
    expect(rollMission(seq([0]), 0).requiredSum).toBe(0);
  });

  it('배율 합산 — 시너지+레벨+필요강화합이 bp로 더해져 수량에만 적용', () => {
    const r = applyMultiplier({ kind: 'dia', diamond: 100 }, 1000 + 500 + expeditionReqBonusBp(1000));
    // 1 + 0.10 + 0.05 + 0.90 = 2.05
    expect(r.diamond).toBe(205);
  });
});
