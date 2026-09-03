/**
 * 실행 플랫폼 감지(2026-09-03, docs/PLAYSTORE.md §1·§3.1) — 안드로이드 TWA(플레이스토어 앱) 여부.
 *
 * TWA 매니페스트의 start_url이 `/?src=twa`로 열리면 proxy.ts가 쿠키 `ig_platform=twa`를 1년 심는다.
 * referrer(`android-app://<package>`)는 첫 내비게이션에만 잡히고 이후 내부 이동에선 사라지므로 쿠키로 고정.
 * 이 값은 **결제 경로 분기**(앱=Play 결제, 웹=포트원)와 문구·안내에만 쓰고, 보상·확률 등 게임 로직에는
 * 절대 쓰지 않는다(쿠키는 유저가 조작 가능 — 결제는 어차피 서버가 Play 영수증으로 검증한다).
 *
 * 서버 컴포넌트/액션은 isTwa(), 클라이언트는 isTwaClient(). 쿠키는 httpOnly가 아니어야 클라가 읽는다.
 */
import { cookies } from 'next/headers';

export const PLATFORM_COOKIE = 'ig_platform';
export const PLATFORM_TWA = 'twa';
/** start_url 쿼리 — TWA 매니페스트(twa-manifest.json)에서만 지정, 웹 PWA 매니페스트(app/manifest.ts)는 '/' 유지. */
export const TWA_SRC_PARAM = 'src';

export type Platform = 'web' | 'twa';

/** 서버 — 현재 요청이 플레이스토어 앱(TWA) 안인지. 요청 컨텍스트 밖(크론 등)이면 web. */
export async function getPlatform(): Promise<Platform> {
  try {
    return (await cookies()).get(PLATFORM_COOKIE)?.value === PLATFORM_TWA ? 'twa' : 'web';
  } catch {
    return 'web';
  }
}

export async function isTwa(): Promise<boolean> {
  return (await getPlatform()) === 'twa';
}

/** 클라이언트 — document.cookie에서 읽는다(SSR 중엔 false). */
export function isTwaClient(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === `${PLATFORM_COOKIE}=${PLATFORM_TWA}`);
}
