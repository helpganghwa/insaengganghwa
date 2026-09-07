/**
 * 플랫폼 감지 — 클라이언트/공용(순수). 서버는 lib/platform.ts(next/headers)를 쓴다.
 * 쿠키 의미·제약은 lib/platform.ts 주석 참조(결제 경로·문구 분기 전용, 게임 로직 금지).
 */
export const PLATFORM_COOKIE = 'ig_platform';
export const PLATFORM_TWA = 'twa';
export const PLATFORM_IOS = 'ios';

export type ClientPlatform = 'web' | 'twa' | 'ios';

/** 쿠키 문자열(document.cookie 형식)에서 플랫폼을 읽는다 — 테스트 가능한 순수 함수. */
export function platformFromCookieString(cookie: string): ClientPlatform {
  const v = cookie
    .split('; ')
    .find((c) => c.startsWith(`${PLATFORM_COOKIE}=`))
    ?.slice(PLATFORM_COOKIE.length + 1);
  return v === PLATFORM_TWA ? 'twa' : v === PLATFORM_IOS ? 'ios' : 'web';
}

/** 클라이언트 — document.cookie에서 읽는다(SSR 중엔 web). */
export function platformClient(): ClientPlatform {
  if (typeof document === 'undefined') return 'web';
  return platformFromCookieString(document.cookie);
}

export function isTwaClient(): boolean {
  return platformClient() === 'twa';
}

export function isIosClient(): boolean {
  return platformClient() === 'ios';
}
