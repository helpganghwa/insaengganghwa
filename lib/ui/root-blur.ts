/**
 * 팝업 뒤 흐림(2026-09-14) — 백드롭의 `backdrop-filter`가 앱(TWA)에서 그려지지 않는 기기가 있다
 * (같은 폰에서 크롬 탭은 흐리고 앱은 60% 검정만 깔림 — 호스트 브라우저·컴포지팅 차이). 그래서
 * 백드롭이 아니라 **뒤 컨텐츠(앱 셸)** 자체에 `filter: blur()`를 건다(`[data-app-shell]`, globals.css).
 * 팝업은 body 포털이라 흐려지지 않는다. 중첩 팝업을 위해 참조 카운트로 켜고 끈다.
 * DOM 없는 환경(SSR·테스트)에서는 아무 일도 하지 않는다.
 */
export const ROOT_BLUR_CLASS = 'ig-modal-open';

let holders = 0;

/** 흐림을 요청한다. 반환된 함수로 해제(멱등). */
export function acquireRootBlur(): () => void {
  holders += 1;
  if (holders === 1 && typeof document !== 'undefined') document.documentElement.classList.add(ROOT_BLUR_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0 && typeof document !== 'undefined') document.documentElement.classList.remove(ROOT_BLUR_CLASS);
  };
}

/** 테스트용 — 현재 흐림을 붙들고 있는 팝업 수. */
export function rootBlurHolders(): number {
  return holders;
}
