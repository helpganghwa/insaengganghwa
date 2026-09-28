import { describe, expect, it } from 'vitest';

import { TOWER_FLOORS, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
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
  it('곡선: 1층 11, 100층 657,504, 오름차순', () => {
    expect(towerRequirement(1)).toBe(11);
    expect(towerRequirement(100)).toBe(657504);
    for (let f = 2; f <= TOWER_FLOORS; f++) expect(towerRequirement(f)).toBeGreaterThanOrEqual(towerRequirement(f - 1));
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
  it('피해는 남은 체력을 넘지 않는다(전투력 차이가 커도)', () => {
    const r = simulateTowerBattle({ towerCp: 96242, requirement: 15, doubledCount: 2, rng: rngOf(3) });
    expect(r.win).toBe(true);
    for (const t of r.turns) expect(t.damage).toBeLessThanOrEqual(100);
  });
  it('턴 기록의 마지막 체력이 승패와 맞는다', () => {
    const r = simulateTowerBattle({ towerCp: 100, requirement: 100, doubledCount: 2, rng: rngOf(42) });
    const last = r.turns[r.turns.length - 1]!;
    if (r.win) expect(last.monHp).toBe(0);
    else expect(last.meHp === 0 || r.turns.length > 0).toBe(true);
    expect(r.keyIndex).toBeGreaterThanOrEqual(0);
    expect(r.keyIndex).toBeLessThan(r.turns.length);
  });
});
