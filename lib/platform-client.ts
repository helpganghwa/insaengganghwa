/**
 * 플랫폼 감지 — 클라이언트/공용(순수). 서버는 lib/platform.ts(next/headers)를 쓴다.
 * 쿠키 의미·제약은 lib/platform.ts 주석 참조(결제 경로·문구 분기 전용, 게임 로직 금지).
 */
export const PLATFORM_COOKIE = 'ig_platform';
export const PLATFORM_TWA = 'twa';

/** 클라이언트 — document.cookie에서 읽는다(SSR 중엔 false). */
export function isTwaClient(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === `${PLATFORM_COOKIE}=${PLATFORM_TWA}`);
}
