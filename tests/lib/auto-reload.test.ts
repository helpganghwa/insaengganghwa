import { describe, expect, it } from 'vitest';

import { RELOAD_COOLDOWN_MS, RELOAD_TS_KEY, UPDATED_FLAG_KEY, autoReloadOnce } from '../../lib/auto-reload';

function memStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

describe('autoReloadOnce', () => {
  it('첫 호출: 시각·플래그를 남기고 새로고침한다', () => {
    const local = memStore(), session = memStore();
    let reloads = 0;
    const ok = autoReloadOnce({ now: () => 1_000_000, local, session, reload: () => void reloads++ });
    expect(ok).toBe(true);
    expect(reloads).toBe(1);
    expect(local.map.get(RELOAD_TS_KEY)).toBe('1000000');
    expect(session.map.get(UPDATED_FLAG_KEY)).toBe('1');
  });

  it('쿨다운 안이면 새로고침하지 않고 시각도 덮어쓰지 않는다', () => {
    const local = memStore({ [RELOAD_TS_KEY]: '1000000' }), session = memStore();
    let reloads = 0;
    const ok = autoReloadOnce({ now: () => 1_000_000 + RELOAD_COOLDOWN_MS - 1, local, session, reload: () => void reloads++ });
    expect(ok).toBe(false);
    expect(reloads).toBe(0);
    expect(local.map.get(RELOAD_TS_KEY)).toBe('1000000');
    expect(session.map.has(UPDATED_FLAG_KEY)).toBe(false);
  });

  it('쿨다운이 지나면 다시 새로고침한다', () => {
    const local = memStore({ [RELOAD_TS_KEY]: '1000000' }), session = memStore();
    let reloads = 0;
    const ok = autoReloadOnce({ now: () => 1_000_000 + RELOAD_COOLDOWN_MS, local, session, reload: () => void reloads++ });
    expect(ok).toBe(true);
    expect(reloads).toBe(1);
    expect(local.map.get(RELOAD_TS_KEY)).toBe(String(1_000_000 + RELOAD_COOLDOWN_MS));
  });

  it('저장소가 throw하면(비공개 모드 등) 새로고침하지 않는다 — 무한 새로고침 방지', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    let reloads = 0;
    const ok = autoReloadOnce({ now: () => 5, local: throwing, session: throwing, reload: () => void reloads++ });
    expect(ok).toBe(false);
    expect(reloads).toBe(0);
  });
});
