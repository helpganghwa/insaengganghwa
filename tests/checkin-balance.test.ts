import { describe, expect, it } from 'vitest';

import {
  CHECKIN_CALENDAR,
  CHECKIN_CYCLE_DAYS,
  advanceCheckinDayProgress,
  checkinRewardForDay,
  isCheckinMilestone,
  nextCheckinDay1Indexed,
  type CheckinReward,
} from '@/lib/game/balance';

/**
 * BALANCE §7 1:1 — 28일 출석 캘린더 회귀 가드(CLAUDE §3.5: 게임산업법 §33 공시 정합).
 * 변경 시 본 테스트도 함께 갱신 + probability_snapshots 기록.
 */

describe('CHECKIN_CALENDAR 테이블', () => {
  it('정확히 28칸', () => {
    expect(CHECKIN_CALENDAR.length).toBe(CHECKIN_CYCLE_DAYS);
    expect(CHECKIN_CYCLE_DAYS).toBe(28);
  });

  it('마일스톤 = D7/D14/D21/D28', () => {
    const milestones = CHECKIN_CALENDAR.map((_, i) => i + 1).filter(isCheckinMilestone);
    expect(milestones).toEqual([7, 14, 21, 28]);
  });

  it('마일스톤 4종 순환: 보급권 30 / 💎2000 / 보급권 60 / 💎3000', () => {
    expect(checkinRewardForDay(7)).toEqual({ kind: 'supply_set', perSlot: 10 });
    expect(checkinRewardForDay(14)).toEqual({ kind: 'diamond', amount: 2000 });
    expect(checkinRewardForDay(21)).toEqual({ kind: 'supply_set', perSlot: 20 });
    expect(checkinRewardForDay(28)).toEqual({ kind: 'diamond', amount: 3000 });
  });

  it('평일 6일 순환: 무10→💎300→방10→💎300→장10→💎300', () => {
    // 1~6, 8~13, 15~20, 22~27 모두 동일 패턴 (mod 7 = 1..6)
    const pattern: CheckinReward[] = [
      { kind: 'supply', slot: 'weapon', count: 10 },
      { kind: 'diamond', amount: 300 },
      { kind: 'supply', slot: 'armor', count: 10 },
      { kind: 'diamond', amount: 300 },
      { kind: 'supply', slot: 'accessory', count: 10 },
      { kind: 'diamond', amount: 300 },
    ];
    for (let week = 0; week < 4; week++) {
      for (let i = 0; i < 6; i++) {
        const day = week * 7 + i + 1;
        expect(checkinRewardForDay(day)).toEqual(pattern[i]);
      }
    }
  });

  it('1사이클 합계 — 보급권 슬롯별 70 + 다이아 8,600', () => {
    let diamond = 0;
    const boxes = { weapon: 0, armor: 0, accessory: 0 };
    for (const r of CHECKIN_CALENDAR) {
      if (r.kind === 'diamond') diamond += r.amount;
      else if (r.kind === 'supply') boxes[r.slot] += r.count;
      else
        for (const s of ['weapon', 'armor', 'accessory'] as const) boxes[s] += r.perSlot;
    }
    expect(diamond).toBe(8_600);
    expect(boxes.weapon).toBe(70);
    expect(boxes.armor).toBe(70);
    expect(boxes.accessory).toBe(70);
  });

  it('checkinRewardForDay 범위 밖 throw', () => {
    expect(() => checkinRewardForDay(0)).toThrow(/INVALID_CHECKIN_DAY/);
    expect(() => checkinRewardForDay(29)).toThrow(/INVALID_CHECKIN_DAY/);
  });
});

describe('출석 진행 — dayProgress 매핑', () => {
  it('초기 dp=0 → 다음 칸 1', () => {
    expect(nextCheckinDay1Indexed(0)).toBe(1);
  });
  it('dp=27 (마지막 수령 후) → 다음 칸 28', () => {
    expect(nextCheckinDay1Indexed(27)).toBe(28);
  });
  it('advance — dp 0..27 → +1, 27 → 0 롤(28 다음 = D1)', () => {
    expect(advanceCheckinDayProgress(0)).toBe(1);
    expect(advanceCheckinDayProgress(26)).toBe(27);
    expect(advanceCheckinDayProgress(27)).toBe(0);
  });
  it('out-of-range 클램프', () => {
    expect(nextCheckinDay1Indexed(-5)).toBe(1);
    expect(nextCheckinDay1Indexed(99)).toBe(28);
  });
});
