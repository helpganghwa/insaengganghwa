import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  holdingSince,
  koDate,
  lastWipeDay,
  ownersBefore,
  replayOwnership,
  sweepPeriods,
  type OwnershipEvent,
} from '@/lib/game/guild/conquest/chronicle-history';

/**
 * 2026-09-17 실측 축약 — 왕국(성·거리)을 A가 8/27~9/10 쥐었다가 9/11 B에게 흩어지고 9/17 되찾음.
 * 민초(C)는 9/15까지 한 곳, 9/16 영토 0, 9/17 복귀.
 */
const EV: OwnershipEvent[] = [
  { day: '2026-08-27', zone: '성', guild: 'A', kind: 'battle' },
  { day: '2026-08-27', zone: '거리', guild: 'A', kind: 'battle' },
  { day: '2026-09-11', zone: '거리', guild: 'B', kind: 'battle' },
  { day: '2026-09-11', zone: '늪', guild: 'C', kind: 'battle' },
  { day: '2026-09-16', zone: '늪', guild: 'B', kind: 'battle' },
  { day: '2026-09-17', zone: '거리', guild: 'A', kind: 'battle' },
  { day: '2026-09-17', zone: '늪', guild: 'C', kind: 'battle' },
];
const REGIONS = new Map([['왕국', ['성', '거리']]]);

describe('연대기 소유 이력 — 2026-09-17', () => {
  const snaps = replayOwnership(EV);

  it('오늘 전 상태는 오늘 전투를 뺀다', () => {
    const before = ownersBefore(snaps, '2026-09-17');
    expect(before.get('거리')).toBe('B');
    expect(before.get('늪')).toBe('B');
  });

  it('석권 구간 — 오늘 전까지 깨진 구간만(되찾은 오늘은 제외)', () => {
    const periods = sweepPeriods(snaps, REGIONS, '2026-09-17');
    expect(periods).toEqual([{ region: '왕국', guild: 'A', from: '2026-08-27', brokenOn: '2026-09-11' }]);
    expect(daysBetween('2026-08-27', '2026-09-11')).toBe(15);
    expect(daysBetween('2026-09-11', '2026-09-17')).toBe(6);
  });

  it('복귀 공백 — 영토 0이 된 날', () => {
    expect(lastWipeDay(snaps, 'C', '2026-09-17')).toBe('2026-09-16');
    expect(lastWipeDay(snaps, 'A', '2026-09-17')).toBeNull();
  });

  it('보유 시작일 — 끊김 없는 마지막 구간', () => {
    expect(holdingSince(snaps, '거리', 'B', '2026-09-17')).toBe('2026-09-11');
    expect(holdingSince(snaps, '늪', 'B', '2026-09-17')).toBe('2026-09-16');
    expect(holdingSince(snaps, '늪', 'C', '2026-09-17')).toBeNull();
  });

  it('같은 날 중립화는 점령보다 먼저 반영된다', () => {
    const s = replayOwnership([
      { day: '2026-09-01', zone: '성', guild: 'A', kind: 'battle' },
      { day: '2026-09-02', zone: '성', guild: 'B', kind: 'battle' },
      { day: '2026-09-02', zone: '성', guild: null, kind: 'neutral' },
    ]);
    expect(s.at(-1)!.owners.get('성')).toBe('B');
    expect(koDate('2026-09-02')).toBe('9월 2일');
  });
});
