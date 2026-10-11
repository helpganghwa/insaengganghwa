import { describe, expect, it } from 'vitest';

import {
  WORLD_BOSS_ATTACK_DROPS, WORLD_BOSS_GUILD_XP_PER_STAGE, WORLD_BOSS_LOOT_PER_STAGE, WORLD_BOSS_LUCKY_MISS_P, WORLD_BOSS_PARTY_MAX,
  WORLD_BOSS_STAGE_BASE_HP, WORLD_BOSS_STAGE_GROWTH, WORLD_BOSS_STAY_MS, WORLD_BOSS_TRAIT, WORLD_BOSS_TRAIT_SLOT_P, WORLD_BOSS_WEAK_PER_SLOT,
} from '@/lib/game/guild/balance';
import { WORLD_BOSS_DEPARTED_TOP } from '@/lib/game/world-boss/queries';

/** 확정 수치 스냅샷(10-11 재검사) — 상수를 읽어 비교하는 테스트는 값을 바꿔도 통과하므로, 사용자와 확정한 숫자를 그대로 적어 둔다. 바꾸려면 docs/WORLD-BOSS.md §7과 함께. */
describe('월드보스 확정 수치', () => {
  it('규칙·체력·전리품·특성', () => {
    expect(WORLD_BOSS_STAY_MS).toBe(48 * 60 * 60 * 1000);
    expect(WORLD_BOSS_PARTY_MAX).toBe(10);
    expect(WORLD_BOSS_STAGE_BASE_HP).toBe(750_000);
    expect(WORLD_BOSS_STAGE_GROWTH).toBe(1.1);
    expect(WORLD_BOSS_LOOT_PER_STAGE).toEqual({ diamond: 150, boxes: 12 });
    expect(WORLD_BOSS_GUILD_XP_PER_STAGE).toBe(20);
    expect(WORLD_BOSS_WEAK_PER_SLOT).toBe(5);
    expect(WORLD_BOSS_LUCKY_MISS_P).toBe(21_000);
    expect(WORLD_BOSS_TRAIT_SLOT_P).toBe(0.7);
    expect(WORLD_BOSS_TRAIT).toMatchObject({ alliance2: 1.2, alliance3: 1.5, bannerPer: 0.05, bannerFull: 1.5, eliteMax: 5, eliteMult: 2.0, eliteRewardMult: 2, legionMult: 1.3, wandererMult: 1.5, wideWeak: 10, fatalWeak: 3, fatalWeakBonus: 2.0, goldenMissDelta: -10_000, heavyLoot: 1.15 });
    expect(WORLD_BOSS_DEPARTED_TOP).toBe(5);
  });
  it('공격 보상 표 v2 전체', () => {
    expect(WORLD_BOSS_ATTACK_DROPS.map((d) => [d.diamond, d.boxes, d.p])).toEqual([
      [0, 0, 30_000], [10, 0, 21_000], [30, 0, 12_000], [80, 0, 7_000], [200, 0, 3_400], [500, 0, 1_200], [1000, 0, 400],
      [0, 3, 15_500], [0, 9, 6_000], [0, 30, 2_500], [0, 90, 700], [0, 150, 300],
    ]);
  });
});
