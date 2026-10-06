/**
 * 결과를 모르는 채 끝난 요청(응답 유실·서버 오류) 뒤 화면을 서버 값으로 다시 맞춘다 — 서버에서는 이미 처리됐을 수 있다.
 * 오프라인이면 연결이 돌아온 뒤에 한다: 끊긴 채로 router.refresh()를 부르면 Next가 전체 새로고침으로 넘어가
 * 게임 화면 대신 브라우저의 오프라인 오류 화면이 뜬다(2026-10-06 최종 검수).
 */
export function resyncWhenOnline(refresh: () => void): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => refresh(), { once: true });
    return;
  }
  refresh();
}
