import { describe, expect, it } from 'vitest';

import { RAID_FREE_OPENS_PER_DAY, RAID_FREE_OPEN_SINCE_ISO, RAID_TIERS } from '@/lib/game/balance';
import { raidFreeOpenActive, raidOpenCost } from '@/lib/game/raid/free-open';

/** 하루 첫 소환 무료(2026-09-08) — 적용 시각·환경·횟수 규칙. */
describe('레이드 하루 첫 소환 무료', () => {
  const since = Date.parse(RAID_FREE_OPEN_SINCE_ISO);

  it('무료 횟수는 1회', () => {
    expect(RAID_FREE_OPENS_PER_DAY).toBe(1);
  });

  it('프로덕션은 적용 시각 전엔 유료, 이후 첫 소환만 무료', () => {
    expect(raidFreeOpenActive(since - 1, 'production')).toBe(false);
    expect(raidFreeOpenActive(since, 'production')).toBe(true);
    expect(raidOpenCost('easy', 0, since - 1, 'production')).toBe(200);
    expect(raidOpenCost('easy', 0, since, 'production')).toBe(0);
    expect(raidOpenCost('normal', 1, since, 'production')).toBe(RAID_TIERS.normal.openCost);
    expect(raidOpenCost('hard', 4, since, 'production')).toBe(RAID_TIERS.hard.openCost);
  });

  it('스테이징(preview)·로컬은 적용 시각과 무관하게 즉시', () => {
    expect(raidFreeOpenActive(since - 86_400_000, 'preview')).toBe(true);
    expect(raidFreeOpenActive(since - 86_400_000, undefined)).toBe(true);
    expect(raidOpenCost('easy', 0, since - 86_400_000, 'preview')).toBe(0);
    expect(raidOpenCost('easy', 1, since - 86_400_000, 'preview')).toBe(200);
  });
});
