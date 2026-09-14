import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

import { clockOffsetMs, serverNow, setServerNow } from '@/lib/client/server-clock';

/**
 * 서버 시계 보정 — 2026-09-14에 대난투·레이드·점령전 카드까지 확대하며 회귀를 고정한다.
 * 종전엔 강화·파견만 쓰고 있었고 테스트가 없었다.
 */
describe('server-clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z')); // 클라 시계
    setServerNow('2026-09-14T00:00:00.000Z'); // offset 0으로 초기화
  });
  afterEach(() => vi.useRealTimers());

  it('보정 전에는 클라 시계 그대로 — 미적용 화면이 종전과 같게 동작한다', () => {
    expect(clockOffsetMs()).toBe(0);
    expect(serverNow()).toBe(Date.now());
  });

  it('폰 시계가 뒤처지면 앞으로 당겨 맞춘다', () => {
    // 서버는 00:05인데 폰은 00:00 → offset +5분
    setServerNow('2026-09-14T00:05:00.000Z');
    expect(clockOffsetMs()).toBe(5 * 60_000);
    expect(serverNow()).toBe(Date.parse('2026-09-14T00:05:00.000Z'));
  });

  it('폰 시계가 앞서면 뒤로 당겨 맞춘다', () => {
    setServerNow('2026-09-13T23:57:00.000Z');
    expect(clockOffsetMs()).toBe(-3 * 60_000);
    expect(serverNow()).toBe(Date.parse('2026-09-13T23:57:00.000Z'));
  });

  it('보정 후에도 시간은 정상적으로 흐른다 — 고정값이 아니다', () => {
    setServerNow('2026-09-14T00:05:00.000Z');
    const t0 = serverNow();
    vi.advanceTimersByTime(3_000);
    expect(serverNow() - t0).toBe(3_000);
  });

  it('깨진 ISO는 무시하고 직전 offset을 유지한다 — 화면이 죽지 않게', () => {
    setServerNow('2026-09-14T00:05:00.000Z');
    const before = clockOffsetMs();
    setServerNow('not-a-date');
    expect(clockOffsetMs()).toBe(before);
  });
});
