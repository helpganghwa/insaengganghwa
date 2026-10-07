import { RAID_DURATION_OPTIONS_MS, RAID_WINDOW_MS, raidTierOf, type RaidTier } from '@/lib/game/balance';

/**
 * 레이드 소환 설정 기억(2026-10-07, 유저 건의 #FXt19nCy) — 소환 화면은 **마지막으로 직접 연 레이드의 설정**으로 시작한다.
 * 따로 저장하지 않고 raids 행에서 읽는다(난이도·친구/길드 공개가 그대로 있고, 공격창 길이 = expire_at − opened_at).
 * 서버 기록이라 기기를 바꿔도 이어진다. 연 적이 없으면 기본값(쉬움 · 6시간 · 공개 안 함).
 * 순수 함수 — 클라이언트도 타입만 가져다 쓴다.
 */
export type RaidShareMode = 'off' | 'free' | 'approval';
export type RaidOpenPrefs = { tier: RaidTier; durationMs: number; friendShare: RaidShareMode; guildShare: RaidShareMode };

export const DEFAULT_RAID_OPEN_PREFS: RaidOpenPrefs = { tier: 'easy', durationMs: RAID_WINDOW_MS, friendShare: 'off', guildShare: 'off' };

const shareOf = (v: unknown): RaidShareMode => (v === 'free' || v === 'approval' ? v : 'off');

/**
 * 마지막 레이드 행 → 소환 화면 기본값. 공격창 길이는 가장 가까운 선택지로 맞춘다 — opened_at(DB 시각)과
 * expire_at(앱 시각)이 몇 ms 어긋나고, 선택지가 바뀐 옛 레이드(1/3/6시간 시절)도 있어서다.
 */
export function raidOpenPrefsFrom(
  row: { tier?: unknown; friendShare?: unknown; guildShare?: unknown; windowMs?: unknown } | null | undefined,
): RaidOpenPrefs {
  if (!row) return DEFAULT_RAID_OPEN_PREFS;
  const ms = Number(row.windowMs);
  const durationMs = Number.isFinite(ms) && ms > 0
    ? RAID_DURATION_OPTIONS_MS.reduce((best, o) => (Math.abs(o - ms) < Math.abs(best - ms) ? o : best), RAID_DURATION_OPTIONS_MS[0])
    : RAID_WINDOW_MS;
  return { tier: raidTierOf(row.tier), durationMs, friendShare: shareOf(row.friendShare), guildShare: shareOf(row.guildShare) };
}
