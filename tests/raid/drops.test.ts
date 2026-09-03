import { describe, expect, it } from 'vitest';

import {
  RAID_TIERS,
  RAID_TIER_CODES,
  raidCumulativeHp,
  raidMilestoneBoxes,
  raidNextMilestone,
} from '@/lib/game/balance';
import {
  aggregatePhaseDrops,
  milestoneDropOutcome,
  phaseDropOutcome,
  raidPhasesCleared,
} from '@/lib/game/raid/drops';

/** 레이드 난이도·마일스톤 드롭(BALANCE §5.4) — 순수 함수. 공시 수치와 1:1(§33). */
describe('raid/drops — 난이도별 돌파 상자·마일스톤', () => {
  const sum = (b: Record<string, number>) => Object.values(b).reduce((s, n) => s + n, 0);

  it('쉬움 9페이즈 = 상자 9(마일스톤 전), 10페이즈 = 10 + 5', () => {
    expect(sum(aggregatePhaseDrops(1n, 9, 'easy').boxes)).toBe(9);
    const d = aggregatePhaseDrops(1n, 10, 'easy');
    expect(d.phaseBoxes).toBe(10);
    expect(d.milestoneBoxes).toBe(5);
    expect(sum(d.boxes)).toBe(15);
  });

  it('보통 10페이즈 = 20 + 5, 25페이즈 = 50 + 215', () => {
    expect(sum(aggregatePhaseDrops(2n, 10, 'normal').boxes)).toBe(25);
    const d = aggregatePhaseDrops(2n, 25, 'normal');
    expect(d.phaseBoxes).toBe(50);
    expect(d.milestoneBoxes).toBe(5 + 30 + 60 + 120);
  });

  it('어려움 15페이즈 = 45 + 135, 20페이즈는 마일스톤 추가 없음', () => {
    expect(sum(aggregatePhaseDrops(3n, 15, 'hard').boxes)).toBe(45 + 45 + 90);
    expect(aggregatePhaseDrops(3n, 20, 'hard').milestoneBoxes).toBe(135);
    expect(raidNextMilestone('hard', 15)).toBeNull();
  });

  it('마일스톤 합·다음 마일스톤 헬퍼가 표와 일치', () => {
    for (const t of RAID_TIER_CODES) {
      const total = Object.values(RAID_TIERS[t].milestones).reduce((s, n) => s + n, 0);
      expect(raidMilestoneBoxes(t, 99)).toBe(total);
      expect(raidMilestoneBoxes(t, 0)).toBe(0);
    }
    expect(raidNextMilestone('easy', 0)).toEqual({ phase: 10, boxes: 5 });
    expect(raidNextMilestone('normal', 15)).toEqual({ phase: 20, boxes: 60 });
  });

  it('결정론 — 같은 (raidId, phase)는 항상 같은 슬롯, 페이즈/마일스톤 키 공간 분리', () => {
    expect(phaseDropOutcome(77n, 3, 'hard')).toEqual(phaseDropOutcome(77n, 3, 'hard'));
    expect(milestoneDropOutcome(77n, 10, 'normal')).toHaveLength(5);
    expect(milestoneDropOutcome(77n, 11, 'normal')).toHaveLength(0);
    // 쉬움의 페이즈 상자는 개편 전 해시 키(`raid:phase:0`)와 같아 기존 레이드 표시가 이어진다.
    expect(phaseDropOutcome(77n, 1, 'easy')).toHaveLength(1);
    expect(phaseDropOutcome(77n, 1, 'normal')[0]).toBe(phaseDropOutcome(77n, 1, 'easy')[0]);
  });

  it('누적 HP 헬퍼는 돌파 판정과 정합(경계값)', () => {
    const p1 = 10_000;
    for (const n of [1, 5, 10, 25]) {
      const cum = raidCumulativeHp(p1, n);
      expect(raidPhasesCleared(p1, cum + 1)).toBe(n);
      expect(raidPhasesCleared(p1, cum - 1)).toBe(n - 1);
    }
  });
});
