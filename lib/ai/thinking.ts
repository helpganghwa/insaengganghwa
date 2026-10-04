import type Anthropic from '@anthropic-ai/sdk';

/**
 * 추론 끄기(2026-10-04 Sonnet 5.5 전환) — Sonnet 5.5는 `thinking: { type: 'disabled' }`를 400으로 거부하고
 * `between_tools`를 받는다(응답 전 추론 없음, 도구 호출 사이 짧은 메모만 — 도구를 안 쓰는 우리 호출은 추론 0).
 * 실측: 같은 질문 출력 토큰 100(생략 시) → 43(between_tools). SDK 0.99 타입엔 아직 없어 단언한다.
 * Opus 5.5·Fable 5.1은 추론을 끌 수 없다(disabled·between_tools 모두 400) — 그 모델엔 thinking을 보내지 않는다.
 */
export const NO_THINKING = { type: 'between_tools' } as unknown as Anthropic.Messages.ThinkingConfigParam;

/** 모델별 추론 끄기 인자 — Sonnet 계열만 끌 수 있다. */
export function noThinkingFor(model: string): { thinking?: Anthropic.Messages.ThinkingConfigParam } {
  return model.startsWith('claude-sonnet-') ? { thinking: NO_THINKING } : {};
}
