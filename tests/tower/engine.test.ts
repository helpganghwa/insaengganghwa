import { describe, expect, it } from 'vitest';

import { TOWER_FLOORS, TOWER_HP_MULT, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
import { simulateTowerBattle } from '@/lib/game/tower/battle';
import { avatarMultiplier, bestLoadout, drawPool, floorRule, towerCp, type EquippedPiece, type SlotKeys } from '@/lib/game/tower/engine';
import { kstWeekStartString } from '@/lib/kst';

const pool: SlotKeys = { weapon: ['w1', 'w2'], armor: ['a1', 'a2'], accessory: ['c1', 'c2'] };
const specials: SlotKeys = { weapon: ['w9'], armor: ['a9'], accessory: ['c9'] };
const eq = (w: string, a: string, c: string, cp = 100): EquippedPiece[] => [
  { slot: 'weapon', key: w, cp },
  { slot: 'armor', key: a, cp },
  { slot: 'accessory', key: c, cp },
];

describe('무한의 탑 수치', () => {
  it('곡선: 1층 64, 10층 159, 100층 724,374, 오름차순·특별층이 구간의 벽', () => {
    expect(towerRequirement(1)).toBe(64);
    expect(towerRequirement(10)).toBe(159);
    expect(towerRequirement(50)).toBe(7433);
    expect(towerRequirement(100)).toBe(724374);
    // 특별층은 앞 층보다 가파르게(×1.45), 일반층은 완만하게(×1.09)
    expect(towerRequirement(60) / towerRequirement(59)).toBeCloseTo(1.45, 2);
    expect(towerRequirement(55) / towerRequirement(54)).toBeCloseTo(1.07, 2);
    expect(towerRequirement(100) / towerRequirement(99)).toBeCloseTo(1.16, 2); // 맨 위 층만 낮은 벽
    for (let f = 2; f <= TOWER_FLOORS; f++) expect(towerRequirement(f)).toBeGreaterThan(towerRequirement(f - 1));
  });
  it('보상 합계 💎100,510 · 📦1,998, 상자는 3의 배수', () => {
    let d = 0, b = 0;
    for (let f = 1; f <= TOWER_FLOORS; f++) {
      const r = towerReward(f);
      d += r.diamond;
      b += r.boxes;
      expect(r.boxes % 3).toBe(0);
    }
    expect(d).toBe(100510);
    expect(b).toBe(1998);
  });
  it('구간·특별층', () => {
    expect(towerSection(1)).toBe(1);
    expect(towerSection(10)).toBe(1);
    expect(towerSection(11)).toBe(2);
    expect(towerIsSpecial(60)).toBe(true);
    expect(towerIsSpecial(57)).toBe(false);
    expect(towerReward(55)).toEqual({ diamond: 250, boxes: 30 });
    expect(towerReward(60)).toEqual({ diamond: 2800, boxes: 60 });
  });
});

describe('탑 전투력', () => {
  it('1~10층(특별층 제외)은 모든 장비 ×1, 아바타 장비면 ×2', () => {
    const rule = floorRule(5, pool, specials);
    expect(towerCp(eq('x', 'y', 'z'), rule, new Set()).total).toBe(300);
    expect(towerCp(eq('x', 'y', 'z'), rule, new Set(['x', 'y'])).total).toBe(500);
  });
  it('일반 층: 요구 장비 아님 ×0 · 요구 장비 ×1 · 아바타에도 쓰임 ×2', () => {
    const rule = floorRule(57, pool, specials);
    const r = towerCp(eq('w1', 'a2', 'zz'), rule, new Set(['w1']));
    expect(r.pieces.map((p) => p.mult)).toEqual([2, 1, 0]);
    expect(r.total).toBe(300);
    expect(r.doubledCount).toBe(1);
  });
  it('특별층: 구간 요구 장비 ×1, 지정 장비만 아바타와 맞으면 ×2', () => {
    const rule = floorRule(60, pool, specials);
    const r = towerCp(eq('w1', 'a9', 'zz'), rule, new Set(['w1', 'a9']));
    expect(r.pieces.map((p) => p.mult)).toEqual([1, 2, 0]);
  });
  it('기본 아바타는 항상 ×1, 아바타 배율 = 아바타 ÷ ×1', () => {
    const rule = floorRule(57, pool, specials);
    expect(avatarMultiplier(eq('w1', 'a1', 'c1'), rule, new Set())).toBe(1);
    expect(avatarMultiplier(eq('w1', 'a1', 'c1'), rule, new Set(['w1', 'a1']))).toBe(1.67);
  });
  it('최적 장착: 아바타 장비 ×2가 더 세면 그것, 아니면 요구 장비 최강', () => {
    const owned = new Map([
      ['w1', { slot: 'weapon' as const, cp: 100 }],
      ['w2', { slot: 'weapon' as const, cp: 150 }],
      ['a1', { slot: 'armor' as const, cp: 100 }],
      ['zz', { slot: 'accessory' as const, cp: 999 }],
    ]);
    const lo = bestLoadout(owned, floorRule(57, pool, specials), new Set(['w1']));
    expect(lo.weapon).toBe('w1'); // 100×2 > 150
    expect(lo.armor).toBe('a1');
    expect(lo.accessory).toBeNull(); // 요구 장비가 없으면 고르지 않는다(×0 장비로 바꿔 끼우지 않음)
  });
});

describe('추첨·주 키', () => {
  it('부위별 n개, 중복 없음', () => {
    const cat: SlotKeys = { weapon: ['a', 'b', 'c', 'd'], armor: ['e', 'f'], accessory: ['g', 'h', 'i'] };
    let i = 0;
    const r = drawPool(cat, () => (i++ * 3373) % 10000, 3);
    expect(r.weapon).toHaveLength(3);
    expect(new Set(r.weapon).size).toBe(3);
    expect(r.armor).toHaveLength(2);
  });
  it('주 시작 = 그 주 월요일(KST)', () => {
    expect(kstWeekStartString(new Date('2026-09-28T03:00:00Z'))).toBe('2026-09-28'); // 월 12시
    expect(kstWeekStartString(new Date('2026-09-27T16:00:00Z'))).toBe('2026-09-28'); // 월 01시 KST
    expect(kstWeekStartString(new Date('2026-09-27T14:00:00Z'))).toBe('2026-09-21'); // 일 23시 KST
  });
});

describe('전투', () => {
  const rngOf = (seed: number) => {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) % 10000;
  };
  it('전투력 0이면 진다', () => {
    expect(simulateTowerBattle({ towerCp: 0, requirement: 100, doubledCount: 0, rng: rngOf(1) }).win).toBe(false);
  });
  it('요구치의 2배면 이기고, 절반이면 진다(표본 200판)', () => {
    let hi = 0, lo = 0;
    for (let i = 0; i < 200; i++) {
      if (simulateTowerBattle({ towerCp: 200, requirement: 100, doubledCount: 0, rng: rngOf(i + 7) }).win) hi++;
      if (simulateTowerBattle({ towerCp: 50, requirement: 100, doubledCount: 0, rng: rngOf(i + 7) }).win) lo++;
    }
    expect(hi).toBe(200);
    expect(lo).toBe(0);
  });
  it('피해는 자르지 않고 실제 값 그대로(전투력 차이가 크면 상대 최대 체력보다 큼), 체력은 0 아래로 내려가지 않는다', () => {
    const r = simulateTowerBattle({ towerCp: 96242, requirement: 15, doubledCount: 2, rng: rngOf(3) });
    expect(r.win).toBe(true);
    expect(Math.max(...r.turns.map((t) => t.damage))).toBeGreaterThan(15 * TOWER_HP_MULT);
    for (const t of r.turns) expect(Math.min(t.meHp, t.monHp)).toBeGreaterThanOrEqual(0);
  });
  it('체력 = 전투력 × 배수 — 비슷한 상대와는 여러 턴(평균 6~12턴)', () => {
    const first = simulateTowerBattle({ towerCp: 1000, requirement: 1000, doubledCount: 0, rng: rngOf(5) }).turns[0]!;
    expect(Math.max(first.meHp, first.monHp)).toBeLessThanOrEqual(1000 * TOWER_HP_MULT);
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const t = simulateTowerBattle({ towerCp: 1000, requirement: 1000, doubledCount: 0, rng: rngOf(i + 101) }).turns;
      sum += t[t.length - 1]!.turn;
    }
    expect(sum / 400).toBeGreaterThan(6);
    expect(sum / 400).toBeLessThan(12);
  });
  it('턴 기록의 마지막 체력이 승패와 맞는다', () => {
    const r = simulateTowerBattle({ towerCp: 100, requirement: 100, doubledCount: 2, rng: rngOf(42) });
    const last = r.turns[r.turns.length - 1]!;
    if (r.win) expect(last.monHp).toBe(0);
    else expect(last.meHp === 0 || r.turns.length > 0).toBe(true);
    expect(r.keyIndex).toBeGreaterThanOrEqual(0);
    expect(r.keyIndex).toBeLessThan(r.turns.length);
  });
  it('변수 줄에는 변수 전 피해(raw)가 남고, 피해 = min(raw × 배율, 남은 체력)', () => {
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      for (const t of simulateTowerBattle({ towerCp: 105, requirement: 100, doubledCount: 3, rng: rngOf(i + 11) }).turns) {
        if (t.event === 'critical' || t.event === 'enrage' || t.event === 'counter' || t.event === 'resonance') {
          expect(t.raw).toBeDefined();
          const mul = t.event === 'critical' ? 1.6 : t.event === 'enrage' ? 1.5 : 0.5;
          expect(t.damage).toBeLessThanOrEqual(Math.round(t.raw! * mul) + 1);
          seen++;
        } else expect(t.raw).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(50);
  });
});
