import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { detectFullBodyCrop } from '@/lib/game/profile/crop-check';

/**
 * 회귀: 하반신 잘림인데 검수 통과했던 실제 아바타(2026-06-26 사용자 신고).
 * 검사 규칙 = "맨 아래 1px 행에 피사체 픽셀이 있으면 잘림"(2026-06-30 단순화 — 옛 bandRatio·
 * headsTall 휴리스틱은 넓은전신/허벅지잘림에서 지표 역전으로 둘을 못 갈랐다). 잘린 캐릭터는
 * 몸이 프레임 바닥까지 꽉 차 맨 아래 행이 점유된다. 로컬 픽스처라 네트워크/API 없이 결정론 검증.
 */
const png = readFileSync(join(import.meta.dirname, '../fixtures/cropped-lowerbody-south.png'));

describe('crop detection — bottom-row rule (lower-body crop regression)', () => {
  it('flags the lower-body crop as cropped (bottom row occupied)', async () => {
    const res = await detectFullBodyCrop(png);
    expect(res.cropped).toBe(true);
    // 잘림이면 맨 아래 행이 피사체로 점유됨(불투명 픽셀 다수).
    expect(res.metrics.bottomRowOpaque).toBeGreaterThanOrEqual(6);
  });
});
