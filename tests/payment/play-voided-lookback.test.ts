import { describe, expect, it } from 'vitest';

import { VOIDED_LOOKBACK_MS } from '@/lib/payment/play';

/**
 * 회귀 방지 — 구글 voided purchases는 startTime이 30일 "이내"여야 하고, 정확히 30일을 보내면
 * 요청이 도달하는 사이 경계를 넘어 매번 400으로 거부된다. 2026-09-11 첫 Play 환불에서
 * 이 한 줄 때문에 크론이 통째로 죽어 회수가 아예 돌지 않았다(조용한 전면 실패라 테스트로 고정한다).
 */
describe('VOIDED_LOOKBACK_MS', () => {
  it('30일보다 짧다 — 경계값은 구글이 거부한다', () => {
    expect(VOIDED_LOOKBACK_MS).toBeLessThan(30 * 24 * 3_600_000);
  });

  it('충분히 길다 — 최소 3주는 거슬러 봐야 놓친 환불을 줍는다', () => {
    expect(VOIDED_LOOKBACK_MS).toBeGreaterThanOrEqual(21 * 24 * 3_600_000);
  });
});
