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

export const APP_SESSION_KEY = 'ig_app';

/** 이 브라우징 컨텍스트가 앱 진입(`/?src=twa`)을 직접 거쳤는가. sessionStorage라 탭·앱마다 독립이다. */
export function isAppSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(APP_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** 표시 모드가 standalone인가 — TWA·설치형 PWA에서 true, 브라우저 탭에서 false. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * 결제 경로 판정(순수) — Play 결제를 쓸 것인가. 사실 수집은 호출부, 규칙은 여기.
 *
 * `hasDigitalGoods`가 1순위다. 단 이 값은 **API의 존재 여부가 아니라 서비스가 실제로 열렸는지**를
 * 뜻한다(`digitalGoodsAvailable()`). 안드로이드 크롬은 일반 탭에서도 `getDigitalGoodsService`를
 * 노출하므로, 존재로 판정하면 웹 유저가 통째로 Play 결제로 갈려 결제가 전부 실패한다
 * (2026-09-11 16:01 ~ 09-12, 실패 주문 19건·성공 0건). 열리는지로 판정하면 앱 안에서만 참이다.
 * 쿠키를 1순위로 쓰면 안 된다 — TWA는 크롬과 저장소를 공유해(docs/PLAYSTORE.md §9-1의 세션 공유와
 * 같은 성질) 앱을 한 번 열면 같은 기기의 크롬 탭에도 `ig_platform`이 남고, 그 브라우저에서 포트원
 * 결제가 통째로 막힌다.
 *
 * 2순위 안전망은 **세션 표식(appSession)뿐**이다: 앱인데 API가 없는 환경(커스텀탭 폴백·구버전
 * 크롬)에서 포트원 결제창을 띄우면 구글 정책 위반이라, 그때는 결제를 포기하고 안내로 끝내야 한다.
 * 세션 표식은 앱 진입(`/?src=twa` → `#app`)이나 `android-app://` referrer에서만 붙고 탭·앱마다
 * 독립이라 다른 브라우징 컨텍스트로 새지 않는다(AppSessionMark).
 *
 * 종전엔 `쿠키 && standalone`도 안전망이었는데 **뺐다**(2026-09-12, 사용자 확정). 쿠키는 앱과 크롬이
 * 공유하므로, 같은 기기에 홈 화면 PWA와 앱을 둘 다 두면 PWA도 `쿠키 && standalone`을 만족해 결제가
 * 통째로 막혔다 — 정작 그 PWA는 Play 결제를 쓸 수 없어 아무 경로도 남지 않는다. 쿠키가 메우던
 * 진짜 구멍(앱인데 API 없음)은 세션 표식이 같은 상황을 이미 잡는다.
 */
export function usePlayBilling(facts: {
  /** Digital Goods 서비스가 실제로 열렸는가(존재 여부가 아니다 — 위 주석). */
  hasDigitalGoods: boolean;
  /** 앱이 심은 표식을 이 브라우징 컨텍스트에서 직접 봤는가(세션 한정 — 쿠키와 달리 새지 않는다). */
  appSession?: boolean;
}): boolean {
  if (facts.hasDigitalGoods) return true;
  // 2순위 안전망 — 앱인데 Digital Goods API가 없는 환경(커스텀탭 폴백·구형 크롬)에서 포트원
  // 결제창을 띄우면 정책 위반이다. 세션 표식은 탭 단위라 같은 기기의 다른 브라우징 컨텍스트로
  // 새지 않는다. 쿠키·standalone은 더 보지 않는다(위 주석 — PWA가 막히던 원인).
  return facts.appSession === true;
}
