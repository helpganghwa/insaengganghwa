import { describe, expect, it } from 'vitest';

import { platformFromCookieString } from '@/lib/platform-client';

describe('platformFromCookieString — 스토어 앱 표식 쿠키 판별', () => {
  it('twa / ios / 없음 / 알 수 없는 값', () => {
    expect(platformFromCookieString('a=1; ig_platform=twa; b=2')).toBe('twa');
    expect(platformFromCookieString('ig_platform=ios')).toBe('ios');
    expect(platformFromCookieString('')).toBe('web');
    expect(platformFromCookieString('ig_platform=android')).toBe('web');
  });
  it('이름이 접두로만 겹치는 쿠키는 무시한다', () => {
    expect(platformFromCookieString('ig_platform_old=twa')).toBe('web');
    expect(platformFromCookieString('xig_platform=twa')).toBe('web');
  });
});
