import { describe, expect, it } from 'vitest';

import { RAID_DURATION_OPTIONS_MS, RAID_WINDOW_MS } from '@/lib/game/balance';
import { DEFAULT_RAID_OPEN_PREFS, raidOpenPrefsFrom } from '@/lib/game/raid/open-prefs';

const HOUR = 3_600_000;

describe('레이드 소환 설정 기억(마지막으로 연 레이드 → 소환 화면 기본값)', () => {
  it('연 적이 없으면 쉬움 · 6시간 · 공개 안 함', () => {
    expect(raidOpenPrefsFrom(null)).toEqual(DEFAULT_RAID_OPEN_PREFS);
    expect(DEFAULT_RAID_OPEN_PREFS).toEqual({ tier: 'easy', durationMs: RAID_WINDOW_MS, friendShare: 'off', guildShare: 'off' });
  });

  it('마지막 레이드의 난이도·공개 범위를 그대로 쓴다', () => {
    expect(raidOpenPrefsFrom({ tier: 'normal', friendShare: 'approval', guildShare: 'free', windowMs: 12 * HOUR })).toEqual({
      tier: 'normal',
      durationMs: 12 * HOUR,
      friendShare: 'approval',
      guildShare: 'free',
    });
  });

  it('공격창 길이는 몇 ms 어긋나도, 옛 선택지(3시간)여도 가장 가까운 선택지로 맞춘다', () => {
    expect(raidOpenPrefsFrom({ tier: 'hard', windowMs: 6 * HOUR - 37 }).durationMs).toBe(6 * HOUR);
    expect(raidOpenPrefsFrom({ tier: 'hard', windowMs: 1 * HOUR + 412 }).durationMs).toBe(1 * HOUR);
    expect(RAID_DURATION_OPTIONS_MS).toContain(raidOpenPrefsFrom({ windowMs: 3 * HOUR }).durationMs);
  });

  it('알 수 없는 값은 기본값으로(DB 값이라도 그대로 믿지 않는다)', () => {
    expect(raidOpenPrefsFrom({ tier: 'nightmare', friendShare: 'all', guildShare: null, windowMs: 'x' })).toEqual(DEFAULT_RAID_OPEN_PREFS);
  });
});
