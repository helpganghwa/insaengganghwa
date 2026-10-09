import { describe, expect, it } from 'vitest';

import {
  WORLD_BOSS_LOOT_PER_STAGE,
  WORLD_BOSS_LOOT_STAGE_CAP,
  WORLD_BOSS_ATTACK_DROPS,
  WORLD_BOSS_ATTACK_DROP_TOTAL,
  WORLD_BOSS_STAGE_BASE_HP,
  WORLD_BOSS_STAGE_GROWTH,
  WORLD_BOSS_LUCKY_MISS_P,
  WORLD_BOSS_PHASES,
  worldBossPhaseOf,
  worldBossExpectedAttacks,
  worldBossLootFor,
  worldBossRollDrop,
  worldBossStageFor,
  worldBossStageHp,
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

  it('전리품은 단계 수만큼 쌓이고 상한 단계에서 멈춘다, 상자는 3의 배수', () => {
    expect(worldBossLootFor(0)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossLootFor(3)).toEqual({ diamond: 3 * WORLD_BOSS_LOOT_PER_STAGE.diamond, boxes: 3 * WORLD_BOSS_LOOT_PER_STAGE.boxes });
    expect(worldBossLootFor(WORLD_BOSS_LOOT_STAGE_CAP + 10)).toEqual(worldBossLootFor(WORLD_BOSS_LOOT_STAGE_CAP));
    expect(WORLD_BOSS_LOOT_PER_STAGE.boxes % 3).toBe(0);
  });

  it('공격 보상 표: 확률 합 100%, 한 칸은 다이아 또는 상자 하나만, 상자는 3의 배수, 꽝 50%, 극악 0.06%', () => {
    expect(WORLD_BOSS_ATTACK_DROPS.reduce((s, d) => s + d.p, 0)).toBe(WORLD_BOSS_ATTACK_DROP_TOTAL);
    for (const d of WORLD_BOSS_ATTACK_DROPS) {
      expect(d.diamond > 0 && d.boxes > 0).toBe(false);
      expect(d.boxes % 3).toBe(0);
    }
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.diamond === 0 && d.boxes === 0)!.p).toBe(50_000);
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.diamond === 1000)!.p).toBe(60);
    expect(WORLD_BOSS_ATTACK_DROPS.find((d) => d.boxes === 300)!.p).toBe(60);
    // 기대값(공격 1회) 💎9.25 📦1.89 — 시안·메모와 같은 값.
    const ev = WORLD_BOSS_ATTACK_DROPS.reduce((s, d) => ({ dia: s.dia + (d.diamond * d.p) / WORLD_BOSS_ATTACK_DROP_TOTAL, box: s.box + (d.boxes * d.p) / WORLD_BOSS_ATTACK_DROP_TOTAL }), { dia: 0, box: 0 });
    expect(ev.dia).toBeCloseTo(9.25, 2);
    expect(ev.box).toBeCloseTo(1.89, 2);
  });

  it('뽑기 경계: 0은 꽝, 1에 가까우면 마지막 칸, 칸 경계가 정확하다', () => {
    expect(worldBossRollDrop(0)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(0.4999999)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(0.5)).toEqual({ diamond: 5, boxes: 0 });
    expect(worldBossRollDrop(0.9999999)).toEqual({ diamond: 0, boxes: 300 });
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

  it('페이즈: 5단계마다 바뀌고 마지막 페이즈에서 멈춘다', () => {
    expect(worldBossPhaseOf(1)).toBe(0);
    expect(worldBossPhaseOf(5)).toBe(0);
    expect(worldBossPhaseOf(6)).toBe(1);
    expect(worldBossPhaseOf(30)).toBe(5);
    expect(worldBossPhaseOf(999)).toBe(WORLD_BOSS_PHASES - 1);
    expect(worldBossPhaseOf(0)).toBe(0);
  });

  it('행운 뽑기: 꽝 35%, 나머지 칸은 비율 그대로(1.3배)', () => {
    expect(worldBossRollDrop(0, true)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(WORLD_BOSS_LUCKY_MISS_P / WORLD_BOSS_ATTACK_DROP_TOTAL - 1e-7, true)).toEqual({ diamond: 0, boxes: 0 });
    expect(worldBossRollDrop(WORLD_BOSS_LUCKY_MISS_P / WORLD_BOSS_ATTACK_DROP_TOTAL, true)).toEqual({ diamond: 5, boxes: 0 });
    expect(worldBossRollDrop(0.9999999, true)).toEqual({ diamond: 0, boxes: 300 });
    // 고른 격자로 기대값을 재면 일반의 1.3배 언저리
    let d = 0, b = 0; const N = 200_000;
    for (let i = 0; i < N; i++) { const r = worldBossRollDrop((i + 0.5) / N, true); d += r.diamond; b += r.boxes; }
    expect(d / N).toBeCloseTo(9.25 * 1.3, 0);
    expect(b / N).toBeCloseTo(1.89 * 1.3, 1);
  });
});
