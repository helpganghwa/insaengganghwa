import { afterEach, describe, expect, it } from 'vitest';

import { APP_SESSION_KEY, detectClientPlatform } from '@/lib/platform-client';

/** 통계용 플랫폼 판정(0199) — 앱 세션 표식 > standalone > web. 쿠키는 보지 않는다. */
type G = { window?: unknown; document?: unknown };
const g = globalThis as G;
afterEach(() => {
  delete g.window;
  delete g.document;
});
function setup(opts: { appSession?: boolean; standalone?: boolean; cookieTwa?: boolean }) {
  const store = new Map<string, string>();
  if (opts.appSession) store.set(APP_SESSION_KEY, '1');
  g.window = {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null },
    matchMedia: (q: string) => ({ matches: q.includes('standalone') ? opts.standalone === true : false }),
  };
  g.document = { cookie: opts.cookieTwa ? 'ig_platform=twa' : '' };
}

describe('detectClientPlatform', () => {
  it('앱 세션 표식이면 twa', () => {
    setup({ appSession: true, standalone: true });
    expect(detectClientPlatform()).toBe('twa');
  });
  it('표식 없이 standalone이면 pwa', () => {
    setup({ standalone: true });
    expect(detectClientPlatform()).toBe('pwa');
  });
  it('둘 다 아니면 web — 새는 쿠키만 있어도 web', () => {
    setup({ cookieTwa: true });
    expect(detectClientPlatform()).toBe('web');
  });
});
