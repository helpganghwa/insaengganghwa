/**
 * 튜토리얼 단계 전환 신호 — 서버 파생(layout)보다 한 박자 빠른 낙관 전진/완료용.
 * 액션을 수행한 컴포넌트가 호출하면 TutorialCoach가 즉시 다음 단계로 넘겨 이전 단계
 * 플래시를 방지한다. 서버 step이 따라오면 그 값이 진실.
 */
export function advanceTutorial() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tutorial:advance'));
}

export function completeTutorial() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tutorial:complete'));
}
