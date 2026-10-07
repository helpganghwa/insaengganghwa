import { describe, expect, it } from 'vitest';

import {
  WORLD_BOSS_LOOT_PER_STAGE,
  WORLD_BOSS_LOOT_STAGE_CAP,
  WORLD_BOSS_PARTY_REWARDS,
  WORLD_BOSS_STAGE_BASE_HP,
  WORLD_BOSS_STAGE_GROWTH,
  worldBossExpectedAttacks,
  worldBossLootFor,
  worldBossPartyReward,
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

  it('원정대 보상은 피해 구간의 마지막 것, 0 피해도 첫 구간, 상자는 전부 3의 배수', () => {
    expect(worldBossPartyReward(0)).toEqual({ diamond: WORLD_BOSS_PARTY_REWARDS[0]!.diamond, boxes: WORLD_BOSS_PARTY_REWARDS[0]!.boxes });
    const last = WORLD_BOSS_PARTY_REWARDS[WORLD_BOSS_PARTY_REWARDS.length - 1]!;
    expect(worldBossPartyReward(last.minDamage)).toEqual({ diamond: last.diamond, boxes: last.boxes });
    expect(worldBossPartyReward(last.minDamage * 100)).toEqual({ diamond: last.diamond, boxes: last.boxes });
    for (let i = 1; i < WORLD_BOSS_PARTY_REWARDS.length; i++) {
      expect(WORLD_BOSS_PARTY_REWARDS[i]!.minDamage).toBeGreaterThan(WORLD_BOSS_PARTY_REWARDS[i - 1]!.minDamage);
      expect(worldBossPartyReward(WORLD_BOSS_PARTY_REWARDS[i]!.minDamage - 1)).toEqual({ diamond: WORLD_BOSS_PARTY_REWARDS[i - 1]!.diamond, boxes: WORLD_BOSS_PARTY_REWARDS[i - 1]!.boxes });
    }
    for (const t of WORLD_BOSS_PARTY_REWARDS) expect(t.boxes % 3).toBe(0);
  });

  it('1인 평균 공격 횟수 = (인원 + 1) ÷ 2', () => {
    expect(worldBossExpectedAttacks(1)).toBe(1);
    expect(worldBossExpectedAttacks(5)).toBe(3);
    expect(worldBossExpectedAttacks(10)).toBe(5.5);
    expect(worldBossExpectedAttacks(0)).toBe(0);
  });
});
