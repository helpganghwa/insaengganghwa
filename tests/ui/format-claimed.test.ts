import { describe, expect, it } from 'vitest';

import { formatClaimedAbsolute, formatClaimedAt } from '@/lib/ui/format-claimed';

const now = Date.parse('2026-10-13T12:40:00+09:00');
const ago = (ms: number) => formatClaimedAt(now - ms, now);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe('formatClaimedAt — 7일까지 상대 시간, 그 뒤 yyyy.MM.dd HH:mm', () => {
  it('1분 안은 방금', () => {
    expect(ago(0)).toBe('방금');
    expect(ago(40_000)).toBe('방금');
  });
  it('분·시간·일 단위는 내림', () => {
    expect(ago(12 * MIN + 30_000)).toBe('12분 전');
    expect(ago(5 * HOUR + 59 * MIN)).toBe('5시간 전');
    expect(ago(26 * HOUR)).toBe('1일 전');
    expect(ago(6 * DAY + 23 * HOUR)).toBe('6일 전');
  });
  it('7일부터는 절대 시각', () => {
    expect(ago(7 * DAY)).toBe(formatClaimedAbsolute(now - 7 * DAY));
    expect(ago(7 * DAY)).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
  });
  it('절대 시각은 두 자리로 채운다', () => {
    const d = new Date(2026, 0, 5, 9, 7); // 기기 시간대 기준 1월 5일 09:07
    expect(formatClaimedAbsolute(d.getTime())).toBe('2026.01.05 09:07');
  });
  it('미래 시각(시계 차이)은 방금', () => {
    expect(formatClaimedAt(now + 5_000, now)).toBe('방금');
  });
});
