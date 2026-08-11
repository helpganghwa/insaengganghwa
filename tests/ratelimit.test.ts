import { describe, expect, it, vi } from 'vitest';

/**
 * 레이트리밋 강등 계약(2026-08-11) — Redis 전용 버킷(chatSend 등)이 Redis 부재·장애 시
 * 제한 0이 되지 않는다는 것만 고정한다. 예전 fail-open에서는 채팅 도배가 무제한이었다.
 *
 * Upstash는 실제로 붙지 않는다 — `limit()`이 항상 던지는 가짜 모듈로 장애를 재현한다.
 */

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {},
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    async limit(): Promise<{ success: boolean }> {
      throw new Error('mock: Upstash 응답 없음');
    }
  },
}));

// env는 모듈 최상단에서 한 번만 읽히므로 주입 뒤에 동적 import 해야 Redis 경로가 켜진다.
process.env.UPSTASH_REDIS_REST_URL = 'https://mock.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
const { rateLimited } = await import('@/lib/ratelimit');

let seq = 0;
/** 창 상태가 모듈 전역에 남으므로 케이스마다 새 식별자를 쓴다. */
const uid = () => `rl-test-${(seq += 1)}`;

describe('레이트리밋 — Redis 장애 시 인메모리 강등', () => {
  // 경고 스로틀 상태도 모듈 전역이라, 첫 실패를 이 케이스가 가져가야 횟수를 셀 수 있다.
  it('장애 경고는 1분에 1회만 — 호출마다 찍어 로그를 태우지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (let i = 0; i < 5; i += 1) await rateLimited(uid(), 'chatBurst');
      const redisWarns = warn.mock.calls.filter((c) => String(c[0]).includes('Redis 오류'));
      expect(redisWarns).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('Redis가 던져도 쿨다운은 살아 있다 — chatSend는 5초당 1회', async () => {
    const u = uid();
    expect(await rateLimited(u, 'chatSend')).toBe(false);
    expect(await rateLimited(u, 'chatSend')).toBe(true);
    expect(await rateLimited(u, 'chatSend')).toBe(true);
  });

  it('분당 상한도 유지된다 — chatBurst 12회 뒤부터 차단', async () => {
    const u = uid();
    for (let i = 0; i < 12; i += 1) expect(await rateLimited(u, 'chatBurst')).toBe(false);
    expect(await rateLimited(u, 'chatBurst')).toBe(true);
  });

  it('강등 창은 유저 단위 — 남의 도배가 내 전송을 막지 않는다', async () => {
    const spammer = uid();
    expect(await rateLimited(spammer, 'whisperSend')).toBe(false);
    expect(await rateLimited(spammer, 'whisperSend')).toBe(true);
    expect(await rateLimited(uid(), 'whisperSend')).toBe(false);
  });
});

describe('레이트리밋 — Upstash env 미설정', () => {
  it('env가 없어도 제한 0이 아니라 인메모리 창으로 내려간다', async () => {
    vi.resetModules();
    const saved = [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN];
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); // 예상된 경고 — 출력만 억제.
    try {
      const { rateLimited: noEnv } = await import('@/lib/ratelimit');
      const u = uid();
      expect(await noEnv(u, 'chatSend')).toBe(false);
      expect(await noEnv(u, 'chatSend')).toBe(true);
    } finally {
      warn.mockRestore();
      [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN] = saved as [
        string,
        string,
      ];
    }
  });
});
