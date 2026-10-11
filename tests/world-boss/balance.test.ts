import { describe, expect, it } from 'vitest';

import {
  WORLD_BOSS_LOOT_PER_STAGE,
  WORLD_BOSS_ATTACK_DROPS,
  WORLD_BOSS_ATTACK_DROP_TOTAL,
  WORLD_BOSS_STAGE_BASE_HP,
  WORLD_BOSS_STAGE_GROWTH,
  WORLD_BOSS_LUCKY_MISS_P,
  worldBossExpectedAttacks,
  worldBossLootFor,
  worldBossRollDrop,
  worldBossStageFor,
  worldBossStageHp,
  WORLD_BOSS_TRAIT,
  WORLD_BOSS_TRAIT_SLOT_P,
  WORLD_BOSS_TRAITS,
  drawWorldBossTraits,
  parseWorldBossTraits,
  worldBossLootMult,
  worldBossMissDelta,
  worldBossPartyTraitMult,
  worldBossPartyTraitStatus,
  worldBossRewardMult,
  worldBossWeakBonus,
  worldBossWeakPerSlot,
} from '@/lib/game/guild/balance';

describe('월드보스 상수 — 단계·전리품·원정대 보상(순수)', () => {
  it('단계 체력은 기본값에서 매 단계 배율만큼 커진다', () => {
    expect(worldBossStageHp(1)).toBe(WORLD_BOSS_STAGE_BASE_HP);
    expect(worldBossStageHp(2)).toBe(Math.round(WORLD_BOSS_STAGE_BASE_HP * WORLD_BOSS_STAGE_GROWTH));
    expect(worldBossStageHp(0)).toBe(WORLD_BOSS_STAGE_BASE_HP); // 0 이하는 1단계와 같다
  });

  it('누적 피해 → 넘긴 단계와 현재 단계 진행', () => {
    expect(worldBossStageFor(0)).toEqual({ stage: 0, into: 0, need: worldBossStageHp(1) });
    expect(worldBossStageFor(WORLD_BOSS_STAGE_BASE_HP - 1).stage).toBe(0);
    const s1 = worldBossStageFor(WORLD_BOSS_STAGE_BASE_HP);
    expect(s1).toEqual({ stage: 1, into: 0, need: worldBossStageHp(2) });
    const two = worldBossStageHp(1) + worldBossStageHp(2);
    expect(worldBossStageFor(two + 5)).toEqual({ stage: 2, into: 5, need: worldBossStageHp(3) });
    expect(worldBossStageFor(-100).stage).toBe(0);
    expect(worldBossStageFor(Number.MAX_SAFE_INTEGER).stage).toBeGreaterThan(30); // 끝이 없되 루프는 끝난다
  });

  it('전리품은 단계 수만큼 쌓인다(상한 없음), 상자는 3의 배수', () => {
    expect(worldBossLootFor(0)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossLootFor(3)).toEqual({ diamond: 3 * WORLD_BOSS_LOOT_PER_STAGE.diamond, boxes: 3 * WORLD_BOSS_LOOT_PER_STAGE.boxes });
    // 상한 없음(10-11): 40단계도 그대로 쌓인다.
    expect(worldBossLootFor(40)).toEqual({ diamond: 40 * WORLD_BOSS_LOOT_PER_STAGE.diamond, boxes: Math.round((40 * WORLD_BOSS_LOOT_PER_STAGE.boxes) / 3) * 3 });
    expect(WORLD_BOSS_LOOT_PER_STAGE.boxes % 3).toBe(0);
  });

  it('공격 보상 표: 확률 합 100%, 한 칸은 다이아 또는 상자 하나만, 상자는 3의 배수, 꽝 30%, 최고 칸 💎1,000 0.4%·📦150 0.3%', () => {
    expect(WORLD_BOSS_ATTACK_DROPS.reduce((s, d) => s + d.p, 0)).toBe(WORLD_BOSS_ATTACK_DROP_TOTAL);
    for (const d of WORLD_BOSS_ATTACK_DROPS) {
      expect(d.diamond > 0 && d.boxes > 0).toBe(false);
      expect(d.boxes % 3).toBe(0);
    }
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.diamond === 0 && d.boxes === 0)!.p).toBe(30_000);
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.diamond === 1000)!.p).toBe(400);
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.boxes === 150)!.p).toBe(300);
    // 기대값(공격 1회) 💎28.1 📦2.835 — 10-11 v2(1인 평균 5.25회 공격으로 보스당 💎148·📦15, 최고 칸은 낮추고 확률은 올림).
    const ev = WORLD_BOSS_ATTACK_DROPS.reduce((s, d) => ({ dia: s.dia + (d.diamond * d.p) / WORLD_BOSS_ATTACK_DROP_TOTAL, box: s.box + (d.boxes * d.p) / WORLD_BOSS_ATTACK_DROP_TOTAL }), { dia: 0, box: 0 });
    expect(ev.dia).toBeCloseTo(28.1, 2);
    expect(ev.box).toBeCloseTo(2.835, 3);
  });

  it('뽑기 경계: 0은 꽝, 1에 가까우면 마지막 칸, 칸 경계가 정확하다', () => {
    expect(worldBossRollDrop(0)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(0.2999999)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(0.3)).toEqual({ diamond: 10, boxes: 0 });
    expect(worldBossRollDrop(0.9999999)).toEqual({ diamond: 0, boxes: 150 });
    let acc = 0;
    for (const d of WORLD_BOSS_ATTACK_DROPS) {
      expect(worldBossRollDrop(acc / WORLD_BOSS_ATTACK_DROP_TOTAL)).toEqual({ diamond: d.diamond, boxes: d.boxes });
      acc += d.p;
    }
  });

  it('1인 평균 공격 횟수 = (인원 + 1) ÷ 2', () => {
    expect(worldBossExpectedAttacks(1)).toBe(1);
    expect(worldBossExpectedAttacks(5)).toBe(3);
    expect(worldBossExpectedAttacks(10)).toBe(5.5);
    expect(worldBossExpectedAttacks(0)).toBe(0);
  });

  it('행운 뽑기: 꽝 21%, 나머지 칸은 비율 그대로(79/70배)', () => {
    expect(worldBossRollDrop(0, true)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(WORLD_BOSS_LUCKY_MISS_P / WORLD_BOSS_ATTACK_DROP_TOTAL - 1e-7, true)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(WORLD_BOSS_LUCKY_MISS_P / WORLD_BOSS_ATTACK_DROP_TOTAL, true)).toEqual({ diamond: 10, boxes: 0 });
    expect(worldBossRollDrop(0.9999999, true)).toEqual({ diamond: 0, boxes: 150 });
    // 고른 격자로 기대값을 재면 일반의 79/70배 언저리
    let d = 0, b = 0; const N = 200_000;
    for (let i = 0; i < N; i++) { const r = worldBossRollDrop((i + 0.5) / N, true); d += r.diamond; b += r.boxes; }
    expect(d / N).toBeCloseTo((28.1 * 79) / 70, 0);
    expect(b / N).toBeCloseTo((2.835 * 79) / 70, 1);
  });
});

describe('월드보스 특성(10-10 확정 9종)', () => {
  it('추첨: 구성 칸·보스 칸 하나씩, 칸마다 P 확률 — 0~2개, 같은 칸은 겹치지 않는다', () => {
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
    expect(drawWorldBossTraits(seq([0.99, 0.99]))).toEqual([]);
    expect(drawWorldBossTraits(seq([0.0, 0.0, 0.99]))).toEqual(['alliance']);
    expect(drawWorldBossTraits(seq([0.1, 0.99, 0.1, 0.99]))).toEqual(['wanderer', 'heavy_treasure']);
    // 균등 격자로 돌리면 칸당 채워질 확률 ≈ P, 두 칸 다 채워지는 비율 ≈ P², 구성끼리·보스끼리는 절대 둘 다 안 나온다
    let one = 0, two = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      const r = drawWorldBossTraits(seq([(i % 40) / 40, ((i * 7) % 50) / 50, ((i * 13) % 40) / 40, ((i * 3) % 40) / 40]));
      if (r.length === 1) one++; if (r.length === 2) two++;
      const groups = r.map((c) => WORLD_BOSS_TRAITS.find((t) => t.code === c)!.group);
      expect(new Set(groups).size).toBe(groups.length);
    }
    expect(two / N).toBeCloseTo(WORLD_BOSS_TRAIT_SLOT_P ** 2, 1);
    expect((one + two) / N).toBeGreaterThan(0.85);
    expect(parseWorldBossTraits(['alliance', 'nope', 'alliance', 3])).toEqual(['alliance']);
  });

  it('보스 특성: 약점 수·보너스·전리품·꽝 확률', () => {
    expect(worldBossWeakPerSlot([])).toBe(5); // 묶음 하나라 5(10-11 사용자)
    expect(WORLD_BOSS_TRAIT.wideWeak).toBe(10);
    expect(WORLD_BOSS_TRAIT.fatalWeak).toBe(3);
    expect(worldBossWeakPerSlot(['wide_weak'])).toBe(WORLD_BOSS_TRAIT.wideWeak);
    expect(worldBossWeakPerSlot(['fatal_weak'])).toBe(WORLD_BOSS_TRAIT.fatalWeak);
    expect(worldBossWeakBonus(['fatal_weak'])).toBe(WORLD_BOSS_TRAIT.fatalWeakBonus);
    expect(worldBossLootMult(['heavy_treasure'])).toBe(WORLD_BOSS_TRAIT.heavyLoot);
    expect(worldBossLootFor(10, worldBossLootMult(['heavy_treasure']))).toEqual({ diamond: Math.round(1500 * 1.15), boxes: Math.round((120 * 1.15) / 3) * 3 });
    // 황금 깃털 — 꽝 20%(30% − 10%p), 나머지 칸은 비율 그대로(80/70배)
    const d = worldBossMissDelta(['golden_feather']);
    expect(worldBossRollDrop(0.199, false, d)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(0.2, false, d)).toEqual({ diamond: 10, boxes: 0 });
    let dia = 0; const N = 100_000;
    for (let i = 0; i < N; i++) dia += worldBossRollDrop((i + 0.5) / N, false, d).diamond;
    expect(dia / N).toBeCloseTo((28.1 * 80) / 70, 0);
  });

  it('구성 특성: 원정대 배율과 상태 문구', () => {
    const g = (xs: (string | null)[]) => xs.map((guild) => ({ guild }));
    expect(worldBossPartyTraitMult(['alliance'], g(['a', 'a']))).toBe(1);
    expect(worldBossPartyTraitMult(['alliance'], g(['a', 'b']))).toBe(WORLD_BOSS_TRAIT.alliance2);
    expect(worldBossPartyTraitMult(['alliance'], g(['a', 'b', 'c', null]))).toBe(WORLD_BOSS_TRAIT.alliance3);
    expect(worldBossPartyTraitMult(['banner'], g(Array(10).fill('a')))).toBe(WORLD_BOSS_TRAIT.bannerFull);
    expect(worldBossPartyTraitMult(['banner'], g(['a', 'a', 'b']))).toBeCloseTo(1 + 0.05 * 2, 5);
    expect(worldBossPartyTraitMult(['elite'], g(['a', 'b', 'c', 'd', 'e']))).toBe(WORLD_BOSS_TRAIT.eliteMult);
    expect(worldBossPartyTraitMult(['elite'], g(Array(6).fill('a')))).toBe(1);
    expect(worldBossPartyTraitMult(['legion'], g(Array(10).fill('a')))).toBe(WORLD_BOSS_TRAIT.legionMult);
    expect(worldBossPartyTraitMult(['wanderer'], g([null]))).toBe(1); // 대원별이라 원정대 배율엔 없음
    expect(worldBossPartyTraitMult(['alliance', 'legion'], g(['a', 'b', 'c', 'c', 'c', 'c', 'c', 'c', 'c', 'c']))).toBeCloseTo(1.5 * 1.3, 5);
    const st = worldBossPartyTraitStatus(['elite', 'wanderer'], g(['a', null]));
    expect(st).toEqual([
      { code: 'elite', mult: 2, active: true, note: '2명' },
      { code: 'wanderer', mult: 1.5, active: true, note: '무소속 1명' },
    ]);
    expect(worldBossPartyTraitStatus(['elite'], g(Array(6).fill('a')))[0]).toMatchObject({ active: false, mult: 1, note: '5명 이하로 출발하면' });
    // 소수 정예 공격 보상 ×2(10-11 사용자) — 켜질 때만, 다른 특성은 1
    expect(worldBossRewardMult(['elite'], g(['a', 'b', null]))).toBe(WORLD_BOSS_TRAIT.eliteRewardMult);
    expect(worldBossRewardMult(['elite'], g(Array(6).fill('a')))).toBe(1);
    expect(worldBossRewardMult(['legion', 'alliance'], g(['a', 'b']))).toBe(1);
  });
});

