import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { detectFullBodyCrop } from '@/lib/game/profile/crop-check';

/**
 * 회귀: 하반신 잘림인데 검수 통과했던 실제 아바타(2026-06-26 사용자 신고).
 * 원인 = wideBottom 비율을 maxSpan으로 정규화 → 팔벌림/망토로 분모 부풀려져 다리 단면이
 * 좁아 보임. 수정 = median(몸통 대표폭) 정규화. 로컬 픽스처라 네트워크/API 없이 결정론 검증.
 */
const png = readFileSync(join(import.meta.dirname, '../fixtures/cropped-lowerbody-south.png'));

describe('crop detection — lower-body crop regression (median normalization)', () => {
  it('flags the wide-character lower-body crop as cropped', async () => {
    const res = await detectFullBodyCrop(png);
    expect(res.cropped).toBe(true);
    // 바닥 프레임에 닿고(margin≈0) median 정규화 비율이 0.5 이상이어야 검출.
    expect(res.metrics.bottomMargin).toBeLessThanOrEqual(0.008);
    expect(res.metrics.bottomBandRatio).toBeGreaterThanOrEqual(0.5);
  });
});
