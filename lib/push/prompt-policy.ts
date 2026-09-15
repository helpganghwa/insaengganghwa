/**
 * 푸시 권한 프롬프트 노출 판정(2026-09-15) — 순수 함수(컴포넌트 밖, 테스트 대상).
 *
 * 시점 변경: 튜토리얼 완료 팝업이 24시간 유예를 거는 대신 **표식(push_prompt_pending)**을 남기고,
 * 그 뒤 강화 페이지에 **다시 들어온 마운트**에서 1회 묻는다. 신규 가입자의 첫 세션 푸시 허용이 5%였고
 * 그 유예 때문에 첫날 안에는 물을 기회 자체가 없었다(9/14~15 코호트 조사). 재진입한 사람 = 관심을
 * 보인 사람이라 거절이 쌓이는 부작용이 적다. iOS(설치 안내 분기)도 같은 시점(사용자 결정).
 *
 * 규칙(위에서부터):
 *  1. 튜토리얼 진행 중·설정에서 알림 끔·7일 거절 윈도 → 숨김
 *  2. 표식이 **이 마운트보다 먼저** 찍혀 있으면 → 노출(trigger·24h 유예와 무관). 같은 방문에서 완료 팝업이
 *     찍은 표식(마운트 뒤)은 무시 — "재진입"에서만 뜨게.
 *  3. 그 외엔 종전 규칙: 24h 유예(레거시 키)면 숨김, trigger(진행 중 잡)면 노출.
 */
export const PENDING_KEY = 'push_prompt_pending';
export const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type PromptGateInput = {
  /** 종전 트리거(강화 페이지에 진행 중 잡). */
  trigger: boolean;
  /** 완료 팝업이 남긴 표식 시각(ms). 없으면 null. */
  pendingAt: number | null;
  /** 이 프롬프트가 마운트된 시각(ms). */
  mountedAt: number;
  now: number;
  tutorialActive: boolean;
  optedOut: boolean;
  /** 명시적 거절 시각(ms), 없으면 0. */
  dismissAt: number;
  /** 레거시 24h 유예 만료 시각(ms), 없으면 0. */
  until: number;
};

export type PromptGate = { show: false } | { show: true; reason: 'pending' | 'trigger' };

export function pushPromptGate(i: PromptGateInput): PromptGate {
  if (i.tutorialActive || i.optedOut) return { show: false };
  if (i.dismissAt > 0 && i.now - i.dismissAt < DISMISS_WINDOW_MS) return { show: false };
  if (i.pendingAt != null && i.pendingAt < i.mountedAt) return { show: true, reason: 'pending' };
  if (i.until > i.now) return { show: false };
  return i.trigger ? { show: true, reason: 'trigger' } : { show: false };
}
