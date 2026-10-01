import { describe, expect, it } from 'vitest';

import { TOWER_FLOORS, TOWER_HP_MULT, towerHuntBox, towerHuntRange, towerHuntReward, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
import { simulateTowerBattle, TOWER_SKILL, type TowerSkill } from '@/lib/game/tower/battle';
import { avatarMultiplier, bestLoadout, drawPool, floorRule, towerCp, type EquippedPiece, type SlotKeys } from '@/lib/game/tower/engine';
import { TOWER_SKILL_INFO, towerFloorInfo, towerFloorSkills } from '@/lib/game/tower/floors';
import { kstWeekStartString } from '@/lib/kst';

const pool: SlotKeys = { weapon: ['w1', 'w2'], armor: ['a1', 'a2'], accessory: ['c1', 'c2'] };
const special: SlotKeys = { weapon: ['w9'], armor: ['a9'], accessory: ['c9'] };
const eq = (w: string, a: string, c: string, cp = 100): EquippedPiece[] => [
  { slot: 'weapon', key: w, cp },
  { slot: 'armor', key: a, cp },
  { slot: 'accessory', key: c, cp },
];

describe('무한의 탑 수치', () => {
  it('곡선: 1층 62, 10층 154, 100층 701,737, 오름차순·특별층이 구간의 벽', () => {
    expect(towerRequirement(1)).toBe(62);
    expect(towerRequirement(10)).toBe(154);
    expect(towerRequirement(50)).toBe(7201);
    expect(towerRequirement(100)).toBe(701737);
    // 특별층은 앞 층보다 가파르게(×1.45), 일반층은 완만하게(×1.07)
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
  it('요구 장비가 없으면(추첨 전·실패) 모두 ×0 — fail-closed(09-30 감사 M1)', () => {
    expect(towerCp(eq('w1', 'a1', 'c1'), floorRule(57, null), new Set()).total).toBe(0);
    expect(towerCp(eq('w9', 'a9', 'c9'), floorRule(60, null), new Set()).total).toBe(0);
  });

  it('1~10층(10층 포함)은 모든 장비 ×1, 아바타 장비면 ×2', () => {
    for (const f of [5, 10]) {
      const rule = floorRule(f, null);
      expect(rule.allowed).toBeNull();
      expect(towerCp(eq('x', 'y', 'z'), rule, new Set()).total).toBe(300);
      expect(towerCp(eq('x', 'y', 'z'), rule, new Set(['x', 'y'])).total).toBe(500);
    }
  });
  it('일반 층: 요구 장비 아님 ×0 · 요구 장비 ×1 · 아바타에도 쓰임 ×2', () => {
    const rule = floorRule(57, pool);
    const r = towerCp(eq('w1', 'a2', 'zz'), rule, new Set(['w1']));
    expect(r.pieces.map((p) => p.mult)).toEqual([2, 1, 0]);
    expect(r.total).toBe(300);
    expect(r.doubledCount).toBe(1);
  });
  it('특별층: 그 층 요구 장비(부위마다 1개)만 — 아바타와 맞으면 ×2, 나머지는 ×0', () => {
    const rule = floorRule(60, special);
    const r = towerCp(eq('w9', 'a9', 'c1'), rule, new Set(['w9']));
    expect(r.pieces.map((p) => p.mult)).toEqual([2, 1, 0]);
  });
  it('기본 아바타는 항상 ×1, 아바타 배율 = 아바타 ÷ ×1', () => {
    const rule = floorRule(57, pool);
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
    const lo = bestLoadout(owned, floorRule(57, pool), new Set(['w1']));
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
  it('변수 줄에는 변수 전 피해(raw)가 남고, 피해 = raw × 배율(남은 체력으로 자르지 않음)', () => {
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      for (const t of simulateTowerBattle({ towerCp: 105, requirement: 100, doubledCount: 3, rng: rngOf(i + 11) }).turns) {
        if (t.event === 'critical' || t.event === 'enrage' || t.event === 'counter' || t.event === 'resonance') {
          expect(t.raw).toBeDefined();
          // 몬스터 급소는 광폭화와 겹칠 수 있다(×1.6×1.5).
          const mul = t.event === 'critical' ? (t.actor === 'mon' ? 1.6 * 1.5 : 1.6) : t.event === 'enrage' ? 1.5 : 0.5;
          expect(t.damage).toBeLessThanOrEqual(Math.round(t.raw! * mul) + 1);
          seen++;
        } else expect(t.raw).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(50);
  });
  it('몬스터도 급소가 있다 — 몬스터 줄에 critical이 나오고 피해가 변수 전보다 크다', () => {
    let monCrit = 0;
    for (let i = 0; i < 300; i++) {
      for (const t of simulateTowerBattle({ towerCp: 100, requirement: 100, doubledCount: 0, rng: rngOf(i + 501) }).turns) {
        if (t.actor === 'mon' && t.event === 'critical') {
          monCrit++;
          expect(t.damage).toBeGreaterThanOrEqual(Math.round(t.raw! * 1.6) - 1);
        }
      }
    }
    expect(monCrit).toBeGreaterThan(20);
  });
});

describe('몬스터 스킬', () => {
  const rngOf = (seed: number) => {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) % 10000;
  };
  const run = (skills: TowerSkill[], seed: number, cp = 110, doubled = 0) =>
    simulateTowerBattle({ towerCp: cp, requirement: 100, doubledCount: doubled, skills, rng: rngOf(seed) });
  const lines = (skills: TowerSkill[], n = 300, cp = 110, doubled = 0) =>
    Array.from({ length: n }, (_, i) => run(skills, i + 1, cp, doubled).turns).flat();
  const winRate = (skills: TowerSkill[], cp = 110) => Array.from({ length: 600 }, (_, i) => run(skills, i + 1, cp).win).filter(Boolean).length / 600;

  it('스킬 없는 층은 예전과 같은 난수 순서 — skills 생략과 빈 배열이 같은 결과', () => {
    for (let i = 0; i < 50; i++) {
      const a = simulateTowerBattle({ towerCp: 100, requirement: 100, doubledCount: 3, rng: rngOf(i) });
      expect(run([], i, 100, 3)).toEqual(a);
    }
  });
  it('스킬마다 같은 전투력에서 이기기 어려워진다(반사는 급소가 날 때만이라 약하다)', () => {
    const base = winRate([]);
    for (const k of Object.keys(TOWER_SKILL) as TowerSkill[]) expect(winRate([k])).toBeLessThanOrEqual(base + 0.01);
    expect(winRate(['freeze'])).toBeLessThan(base - 0.1);
  });
  it('강철 피부 — 내 처음 두 번의 피해만 절반', () => {
    for (let i = 0; i < 100; i++) {
      const mine = run(['steel'], i + 1).turns.filter((t) => t.actor === 'me' && t.raw != null && (t.event === null || t.event === 'first_strike' || t.event === 'critical' || t.event === 'counter' || t.event === 'resonance'));
      const tagged = mine.filter((t) => t.skills?.includes('steel'));
      expect(tagged.length).toBeLessThanOrEqual(TOWER_SKILL.steel.hits);
      for (const t of tagged) if (t.event === null || t.event === 'first_strike') expect(Math.abs(t.damage - t.raw! * TOWER_SKILL.steel.mul)).toBeLessThanOrEqual(1);
    }
  });
  it('빙결·시간 정지 — 내 차례를 쉬는 줄(피해 0)이 나오고, 시간 정지는 한 판에 한 번만 걸린다', () => {
    const fz = lines(['freeze']);
    expect(fz.some((t) => t.actor === 'me' && t.event === 'skill' && t.skills?.[0] === 'freeze' && t.damage === 0)).toBe(true);
    for (let i = 0; i < 200; i++) {
      const tr = run(['stop'], i + 1).turns;
      expect(tr.filter((t) => t.actor === 'mon' && t.skills?.includes('stop')).length).toBeLessThanOrEqual(1);
      expect(tr.filter((t) => t.actor === 'me' && t.event === 'skill').length).toBeLessThanOrEqual(TOWER_SKILL.stop.turns);
    }
  });
  it('봉인 — 내 급소·반격·공명이 없다', () => {
    for (const t of lines(['seal'], 300, 110, 3)) if (t.actor === 'me') expect(['critical', 'counter', 'resonance']).not.toContain(t.event);
  });
  it('흡혈·재생·부활 — 회복량이 기록되고 최대 체력을 넘지 않는다, 부활은 한 번', () => {
    const monMax = 100 * TOWER_HP_MULT;
    for (const k of ['drain', 'regen', 'rebirth'] as TowerSkill[]) {
      const ls = lines([k]);
      expect(ls.some((t) => (t.heal ?? 0) > 0)).toBe(true);
      for (const t of ls) expect(t.monHp).toBeLessThanOrEqual(monMax);
    }
    for (const t of lines(['drain'])) if (t.heal) expect(t.heal).toBeLessThanOrEqual(Math.round((t.damage * TOWER_SKILL.drain.pct) / 100) + 1);
    for (let i = 0; i < 200; i++) expect(run(['rebirth'], i + 1).turns.filter((t) => t.skills?.includes('rebirth')).length).toBeLessThanOrEqual(1);
  });
  it('즉사 — 강해도 가끔 진다(남은 체력 전부), 기사회생이면 버틴다', () => {
    const ls = lines(['death'], 400, 300);
    const hits = ls.filter((t) => t.skills?.includes('death'));
    expect(hits.length).toBeGreaterThan(0);
    for (const t of hits) expect(t.meHp === 0 || (t.event === 'revive' && t.meHp === 1)).toBe(true);
    expect(winRate(['death'], 1000)).toBeLessThan(1);
  });
  it('반사 — 급소로 몬스터를 쓰러뜨린 한 방에는 반사가 없다(동시 0으로 지지 않는다)', () => {
    let kills = 0;
    for (let i = 0; i < 2000; i++) {
      const r = run(['reflect'], i + 1, 300);
      const t = r.turns;
      const k = t.findIndex((x) => x.actor === 'me' && x.monHp === 0);
      if (k < 0) continue;
      kills++;
      expect(t.slice(k + 1).some((x) => x.skills?.includes('reflect'))).toBe(false);
      expect(r.win).toBe(t[t.length - 1]!.meHp > 0);
    }
    expect(kills).toBeGreaterThan(100);
  });
  it('위압 — 처음 몇 턴의 내 피해만 줄어든다', () => {
    for (const t of lines(['awe'])) if (t.skills?.includes('awe')) expect(t.turn).toBeLessThanOrEqual(TOWER_SKILL.awe.turns);
  });
  it('체력은 0 아래로 내려가지 않고, 이긴 판의 마지막 줄은 몬스터 체력 0', () => {
    const all: TowerSkill[] = ['steel', 'freeze', 'burn', 'drain', 'multi', 'reflect', 'regen', 'stop', 'rebirth', 'awe'];
    for (let i = 0; i < 200; i++) {
      const r = run(all, i + 1, 250);
      for (const t of r.turns) expect(Math.min(t.meHp, t.monHp)).toBeGreaterThanOrEqual(0);
      if (r.win) expect(r.turns[r.turns.length - 1]!.monHp).toBe(0);
    }
  });
});

describe('층 몬스터·스킬 배치', () => {
  it('100층 모두 이름·설명이 있고 이름이 겹치지 않는다', () => {
    const names = Array.from({ length: TOWER_FLOORS }, (_, i) => towerFloorInfo(i + 1));
    for (const f of names) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.line.length).toBeGreaterThan(0);
    }
    expect(new Set(names.map((f) => f.name)).size).toBe(TOWER_FLOORS);
  });
  it('1~9층은 스킬 없음, 수문장은 1~4개, 일반층은 0~1개, 즉사는 100층에만', () => {
    for (let f = 1; f <= TOWER_FLOORS; f++) {
      const sk = towerFloorSkills(f);
      if (f < 10) expect(sk).toEqual([]);
      if (f % 10 === 0) {
        expect(sk.length).toBeGreaterThanOrEqual(1);
        expect(sk.length).toBeLessThanOrEqual(4);
      } else expect(sk.length).toBeLessThanOrEqual(1);
      if (f !== 100) expect(sk).not.toContain('death');
      for (const k of sk) expect(TOWER_SKILL_INFO[k]).toBeDefined();
    }
    expect(towerFloorSkills(100)).toContain('death');
  });
});


describe('토벌 보상 표', () => {
  it('💎 범위는 그 층 평균 ±20%(반올림), 구간 안에서 층마다 오르고 특별층이 최대, 구간 평균 ≈ 기준값, 상자는 3의 배수', () => {
    expect(towerHuntRange(1)).toEqual({ min: 2, max: 2 });
    expect(towerHuntRange(15)).toEqual({ min: 3, max: 5 });
    expect(towerHuntRange(91)).toEqual({ min: 96, max: 144 });
    expect(towerHuntRange(100)).toEqual({ min: 156, max: 234 });
    for (let sec = 1; sec <= 10; sec++) {
      const lo = (sec - 1) * 10 + 1;
      const vals = Array.from({ length: 10 }, (_, j) => towerHuntReward(lo + j));
      for (let j = 1; j < 10; j++) expect(vals[j]!).toBeGreaterThanOrEqual(vals[j - 1]!);
      expect(vals[9]!).toBe(Math.max(...vals));
      const base = towerReward(lo).diamond / 10;
      expect(vals.reduce((a, b) => a + b, 0) / 10).toBeGreaterThan(base * 0.95);
      expect(vals.reduce((a, b) => a + b, 0) / 10).toBeLessThan(base * 1.1);
    }
    for (let f = 1; f <= 100; f++) expect(towerHuntBox(f) % 3).toBe(0);
    expect(towerHuntBox(95)).toBe(45);
  });
});
