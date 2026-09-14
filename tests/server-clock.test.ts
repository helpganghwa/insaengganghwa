import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

import { __resetServerClockForTests, clockOffsetMs, isServerClockEstablished, serverNow, setServerNow } from '@/lib/client/server-clock';

/**
 * 서버 시계 보정 — 2026-09-14에 대난투·레이드·점령전 카드까지 확대하며 회귀를 고정한다.
 * 종전엔 강화·파견만 쓰고 있었고 테스트가 없었다.
 */
describe('server-clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z')); // 클라 시계
    __resetServerClockForTests();
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
    // 첫 등록이 이 값 — 이미 등록된 세션에서 더 낮은 값은 오염(캐시)으로 보고 버리므로(아래 테스트) 초기화하고 시작.
    __resetServerClockForTests();
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

  it('뒤로가기로 복원된 옛 시각(더 낮은 offset)은 버린다 — 시계를 과거로 밀지 않는다', () => {
    setServerNow('2026-09-14T00:05:00.000Z'); // 신선한 등록: +5분
    setServerNow('2026-09-14T00:01:00.000Z'); // 4분 전 렌더된 캐시 페이로드가 다시 들어옴
    expect(clockOffsetMs()).toBe(5 * 60_000);
  });

  it('폰 시계를 뒤로 돌리면(참 offset ↑) 새 값을 따라간다', () => {
    setServerNow('2026-09-14T00:05:00.000Z');
    vi.setSystemTime(new Date('2026-09-13T23:50:00.000Z')); // 폰 시계 10분 뒤로
    setServerNow('2026-09-14T00:05:10.000Z');
    expect(clockOffsetMs()).toBe(15 * 60_000 + 10_000);
  });

  it('첫 등록 전에는 미등록 상태, 등록 뒤에는 established', () => {
    __resetServerClockForTests();
    expect(isServerClockEstablished()).toBe(false);
    setServerNow('2026-09-14T00:00:00.000Z');
    expect(isServerClockEstablished()).toBe(true);
  });
});
