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

/** 표시 모드가 standalone인가 — TWA·설치형 PWA에서 true, 브라우저 탭에서 false. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * 결제 경로 판정(순수) — Play 결제를 쓸 것인가. 사실 수집은 호출부, 규칙은 여기.
 *
 * `hasDigitalGoods`가 1순위다. 이 API는 Play 결제를 켠 TWA 안에서만 노출되므로 '앱 안'의 확실한 증거다.
 * 쿠키를 1순위로 쓰면 안 된다 — TWA는 크롬과 저장소를 공유해(docs/PLAYSTORE.md §9-1의 세션 공유와
 * 같은 성질) 앱을 한 번 열면 같은 기기의 크롬 탭에도 `ig_platform`이 남고, 그 브라우저에서 포트원
 * 결제가 통째로 막힌다.
 *
 * 쿠키는 2순위 안전망으로만 쓴다: 앱인데 API가 없는 환경(커스텀탭 폴백·구버전 크롬)에서 포트원
 * 결제창을 띄우면 구글 정책 위반이라, 그때는 결제를 포기하고 안내로 끝내야 한다. `standalone`을 함께
 * 보는 이유는 브라우저 탭을 이 안전망에서 빼기 위해서다.
 * 남는 틈: 같은 기기에 PWA와 앱을 모두 설치하면 PWA도 standalone이라 안내로 빠진다(결제는 앱에서 가능).
 */
export function usePlayBilling(facts: {
  hasDigitalGoods: boolean;
  twaCookie: boolean;
  standalone: boolean;
}): boolean {
  if (facts.hasDigitalGoods) return true;
  return facts.twaCookie && facts.standalone;
}
