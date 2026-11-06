import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 채팅 Realtime 지연 로드 실패 복구(2026-11-06 업데이트 18) — realtime-js 청크 로드가 실패해도 물러섰다가 다시 받아
 * 그때 구독한다(종전 supabase-js 정적 번들은 실패할 일이 없었다).
 */
let failLeft = 0;
const subscribed: string[] = [];
const removed: string[] = [];
function mockRealtime() {
  vi.doMock('@supabase/realtime-js', () => {
    if (failLeft > 0) {
      failLeft -= 1;
      throw new Error('chunk load failed');
    }
    class RealtimeClient {
      channel(topic: string) {
        const ch = {
          topic,
          on: () => ch,
          subscribe: () => {
            subscribed.push(topic);
            return ch;
          },
        };
        return ch;
      }
      removeChannel(ch: { topic: string }) {
        removed.push(ch.topic);
        return Promise.resolve('ok');
      }
    }
    return { RealtimeClient };
  });
}

describe('subscribeBroadcast 로드 재시도', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    subscribed.length = 0;
    removed.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    mockRealtime();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('첫 로드가 실패하면 1초 뒤 다시 받아 구독한다', async () => {
    failLeft = 1;
    const { subscribeBroadcast } = await import('@/lib/supabase-browser');
    const off = subscribeBroadcast('chat:t1', { m: () => {} });
    await vi.advanceTimersByTimeAsync(10);
    expect(subscribed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(subscribed).toEqual(['chat:t1']);
    off();
    expect(removed).toEqual(['chat:t1']);
  });

  it('재시도 전에 해제되면 구독하지 않는다', async () => {
    failLeft = 1;
    const { subscribeBroadcast } = await import('@/lib/supabase-browser');
    const off = subscribeBroadcast('chat:t2', { m: () => {} });
    await vi.advanceTimersByTimeAsync(10);
    off();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subscribed).toEqual([]);
  });
});
