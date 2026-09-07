import { describe, expect, it } from 'vitest';

import { msUntilNextKstMidnight } from '@/lib/kst';

/** 정밀 자정 공개 크론의 대기 계산 — KST 자정까지 남은 ms(항상 0 < 값 ≤ 24h). */
describe('msUntilNextKstMidnight', () => {
  it('23:58:30 KST → 90초', () => {
    expect(msUntilNextKstMidnight(new Date('2026-09-04T14:58:30.000Z'))).toBe(90_000);
  });
  it('00:00:10 KST(자정 직후) → 거의 24시간(지연 기동 판정에 쓰임)', () => {
    expect(msUntilNextKstMidnight(new Date('2026-09-04T15:00:10.000Z'))).toBe(24 * 60 * 60 * 1000 - 10_000);
  });
  it('정각 → 정확히 24시간, 한낮 → 창 밖', () => {
    expect(msUntilNextKstMidnight(new Date('2026-09-04T15:00:00.000Z'))).toBe(24 * 60 * 60 * 1000);
    const noon = msUntilNextKstMidnight(new Date('2026-09-04T03:00:00.000Z'));
    expect(noon).toBe(12 * 60 * 60 * 1000);
  });
});
