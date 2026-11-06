/**
 * 팝업 뒤 흐림(2026-09-14) — 백드롭의 `backdrop-filter`가 앱(TWA)에서 그려지지 않는 기기가 있다
 * (같은 폰에서 크롬 탭은 흐리고 앱은 60% 검정만 깔림 — 호스트 브라우저·컴포지팅 차이). 그래서
 * 백드롭이 아니라 **뒤 컨텐츠(앱 셸)** 자체에 `filter: blur()`를 건다(`[data-app-shell]`, globals.css).
 * 팝업은 body 포털이라 흐려지지 않는다. 중첩 팝업을 위해 참조 카운트로 켜고 끈다.
 * DOM 없는 환경(SSR·테스트)에서는 아무 일도 하지 않는다.
 */
export const ROOT_BLUR_CLASS = 'ig-modal-open';

let holders = 0;

/** 흐림 켜짐·꺼짐 구독자(2026-11-06 업데이트 18) — 흐림 아래의 rAF 루프(초월 캔버스 등)가 멈췄다가 닫힐 때 다시 돈다. */
const listeners = new Set<(blurred: boolean) => void>();
function notify(blurred: boolean) {
  for (const cb of listeners) cb(blurred);
}

/** 흐림을 요청한다. 반환된 함수로 해제(멱등). */
export function acquireRootBlur(): () => void {
  holders += 1;
  if (holders === 1) {
    if (typeof document !== 'undefined') document.documentElement.classList.add(ROOT_BLUR_CLASS);
    notify(true);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) {
      if (typeof document !== 'undefined') document.documentElement.classList.remove(ROOT_BLUR_CLASS);
      notify(false);
    }
  };
}

/**
 * 팝업 뒤 흐림이 켜져 있는가(2026-11-06 업데이트 18). 흐림 아래 그림은 어차피 흐려 보이므로 애니메이션을 멈춰
 * 매 프레임 전체 화면 블러를 다시 계산하지 않게 한다(CSS 애니메이션은 globals.css가 같은 클래스로 멈춘다).
 */
export function isRootBlurred(): boolean {
  return holders > 0;
}

/** 흐림 켜짐(true)·꺼짐(false) 전환을 구독한다. 반환 함수로 해제. */
export function subscribeRootBlur(cb: (blurred: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 테스트용 — 현재 흐림을 붙들고 있는 팝업 수. */
export function rootBlurHolders(): number {
  return holders;
}
