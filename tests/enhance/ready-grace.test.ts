import { describe, expect, it } from 'vitest';

import { ENHANCE_READY_GRACE_MS, enhanceReadyGraceMs } from '@/lib/game/balance';

describe('완료 유예(enhanceReadyGraceMs, 2026-08-28)', () => {
  it('긴 잡은 2.5초 고정, 짧은 잡은 총시간의 30% 상한', () => {
    expect(enhanceReadyGraceMs(60 * 60 * 1000)).toBe(ENHANCE_READY_GRACE_MS);
    expect(enhanceReadyGraceMs(10_000)).toBe(2500);
    expect(enhanceReadyGraceMs(5_000)).toBe(1500);
    expect(enhanceReadyGraceMs(1_000)).toBe(300);
  });
});
