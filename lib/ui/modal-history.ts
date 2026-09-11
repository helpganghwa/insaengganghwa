/**
 * 모달이 쌓는 히스토리 항목의 공유 규약 — `ModalShell`이 심고 `RouteTransitionOverlay`가 읽는다.
 *
 * 안드로이드 뒤로가기로 모달을 닫으려면 모달이 열릴 때 히스토리 항목을 하나 쌓아 둬야 한다.
 * 그런데 그 항목은 **화면 이동이 아니다.** 구분할 표식이 없으면 라우트 전환 로딩 오버레이가
 * 모달을 열 때마다 뜨고(2026-09-11 회귀), 라우트가 바뀌어 모달이 사라진 경우까지 히스토리를
 * 되돌려 방금 떠난 화면으로 튕겨 돌아온다. 두 쪽이 같은 표식을 보게 이 모듈로 모은다.
 */

/** 모달이 심는 history.state 키. 값은 셸 인스턴스마다 다른 토큰(아래). */
export const MODAL_HISTORY_KEY = 'igModal';

/** 이번 페이지 로드에서만 유효한 접두사 — 새로고침 전 항목의 토큰과 겹치지 않게 한다. */
const LOAD_ID = Math.random().toString(36).slice(2, 8);
let seq = 0;

/** 셸 인스턴스 하나를 가리키는 토큰. history.state에 실려야 하므로 문자열이다(Symbol 불가). */
export function nextModalToken(): string {
  seq += 1;
  return `${LOAD_ID}-${seq}`;
}

/** 현재 히스토리 항목에 실린 모달 토큰(모달 항목이 아니면 null). */
export function currentModalToken(): string | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as Record<string, unknown> | null;
  const token = state?.[MODAL_HISTORY_KEY];
  return typeof token === 'string' ? token : null;
}

/** pushState 인자로 넘어온 state가 모달 표식인가 — 오버레이가 화면 이동과 구분하는 근거. */
export function isModalHistoryState(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  return typeof (state as Record<string, unknown>)[MODAL_HISTORY_KEY] === 'string';
}

/**
 * popstate가 왔을 때 이 셸이 닫혀야 하는가 — **내 항목이 사라졌을 때만**.
 *
 * 중첩 모달에서 위 팝업이 닫히면 현재 항목은 내 토큰으로 되돌아온다. 그때 같이 닫으면
 * 확인 팝업에서 '취소'를 누를 때 뒤의 시트까지 닫힌다. 열린 순서(스택)로는 판정할 수 없다 —
 * 위 팝업은 이 시점에 이미 스택에서 빠져 내가 최상단으로 보이기 때문이다.
 */
export function shouldCloseOnPop(currentToken: string | null, myToken: string): boolean {
  return currentToken !== myToken;
}

/**
 * 언마운트할 때 쌓아 둔 항목을 걷어내야(back) 하는가.
 *
 * 뒤로가기로 닫혔으면 이미 소비됐고, 라우트가 바뀌어 언마운트됐으면 내 항목은 새 라우트 아래로
 * 묻혔다. 후자에서 back을 부르면 방금 떠난 화면으로 도로 튕긴다. 내 항목이 현재일 때만 참.
 */
export function shouldRewindOnUnmount(opts: {
  poppedByBack: boolean;
  currentToken: string | null;
  myToken: string;
}): boolean {
  if (opts.poppedByBack) return false;
  return opts.currentToken === opts.myToken;
}

/** 열려 있는 모달 수 — 뒤로가기가 모달을 닫는 것인지(화면 이동이 아닌지) 판정한다. */
let openCount = 0;
export function modalHistoryOpened(): void {
  openCount += 1;
}
export function modalHistoryClosed(): void {
  openCount = Math.max(0, openCount - 1);
}
export function hasOpenModal(): boolean {
  return openCount > 0;
}

/**
 * 모달이 스스로 되돌린 back() 표식 — 화면 버튼으로 닫을 때 쌓아 둔 항목을 걷어내는 호출이다.
 * 뒤이어 오는 popstate는 화면 이동이 아니므로 오버레이가 건너뛴다.
 */
let selfBackAt = 0;
export function markModalBack(): void {
  selfBackAt = Date.now();
}
export function consumeModalBack(): boolean {
  // back()이 예약한 popstate는 바로 다음 태스크에 온다 — 창을 짧게 잡아 진짜 이동을 삼키지 않는다.
  const recent = Date.now() - selfBackAt < 1000;
  if (recent) selfBackAt = 0;
  return recent;
}
