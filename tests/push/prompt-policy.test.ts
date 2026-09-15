import { describe, expect, it } from 'vitest';

import { DISMISS_WINDOW_MS, pushPromptGate } from '@/lib/push/prompt-policy';

/** 푸시 프롬프트 시점(2026-09-15): 튜토리얼 완료 표식은 '재진입 마운트'에서만, 거절·튜토리얼·설정 끔이 우선. */
const T = 1_000_000_000_000;
const base = { trigger: false, pendingAt: null, mountedAt: T, now: T + 1_000, tutorialActive: false, optedOut: false, dismissAt: 0, until: 0 };

describe('pushPromptGate', () => {
  it('표식이 마운트보다 먼저면 trigger·24h 유예와 무관하게 노출', () => {
    expect(pushPromptGate({ ...base, pendingAt: T - 60_000, until: T + 86_400_000 })).toEqual({ show: true, reason: 'pending' });
  });
  it('같은 방문에서 완료 팝업이 찍은 표식(마운트 뒤)은 무시 — 재진입에서만', () => {
    expect(pushPromptGate({ ...base, pendingAt: T + 500 })).toEqual({ show: false });
    expect(pushPromptGate({ ...base, pendingAt: T + 500, trigger: true })).toEqual({ show: true, reason: 'trigger' });
  });
  it('튜토리얼 진행 중·설정 끔·7일 거절은 표식보다 우선', () => {
    expect(pushPromptGate({ ...base, pendingAt: T - 1, tutorialActive: true })).toEqual({ show: false });
    expect(pushPromptGate({ ...base, pendingAt: T - 1, optedOut: true })).toEqual({ show: false });
    expect(pushPromptGate({ ...base, pendingAt: T - 1, dismissAt: T - DISMISS_WINDOW_MS + 5_000 })).toEqual({ show: false });
    expect(pushPromptGate({ ...base, pendingAt: T - 1, dismissAt: T - DISMISS_WINDOW_MS - 5_000 })).toEqual({ show: true, reason: 'pending' });
  });
  it('표식 없으면 종전 규칙 — 24h 유예면 숨김, 아니면 trigger', () => {
    expect(pushPromptGate({ ...base, trigger: true, until: T + 10_000 })).toEqual({ show: false });
    expect(pushPromptGate({ ...base, trigger: true, until: T - 10_000 })).toEqual({ show: true, reason: 'trigger' });
    expect(pushPromptGate({ ...base, trigger: false })).toEqual({ show: false });
  });
});
