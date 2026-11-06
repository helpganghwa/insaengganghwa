import { describe, expect, it } from 'vitest';

import {
  ATLAS_SMALL_URL,
  ATLAS_URL,
  atlasBgStyle,
  atlasImageFor,
  atlasMaskStyle,
  ATLAS_CODES,
} from '@/lib/game/equipment/sprite-atlas';

/** 반 해상도 atlas 선택(2026-11-06 업데이트 18) — 기기 픽셀(크기 × 배율) 128 이하만 128 atlas(늘려 그리지 않음), 위치·크기 값은 그대로. */
describe('atlasImageFor', () => {
  it('해시 파일명(쿼리 캐시 무효화 아님)', () => {
    expect(ATLAS_SMALL_URL).toMatch(/^\/sprites\/atlas-128-[0-9a-f]{8}\.webp$/);
    expect(ATLAS_URL).toMatch(/^\/sprites\/atlas-[0-9a-f]{8}\.webp$/);
  });
  it('32px 이하는 항상 128, 129px 이상은 항상 원본', () => {
    expect(atlasImageFor(26)).toBe(`url(${ATLAS_SMALL_URL})`);
    expect(atlasImageFor(32)).toBe(`url(${ATLAS_SMALL_URL})`);
    expect(atlasImageFor(129)).toBe(`url(${ATLAS_URL})`);
    expect(atlasImageFor(144)).toBe(`url(${ATLAS_URL})`);
  });
  it('33~128px는 배율별 — 크기 × 배율이 128 이하인 배율만 128', () => {
    expect(atlasImageFor(36)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_SMALL_URL}) 2x, url(${ATLAS_SMALL_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
    expect(atlasImageFor(48)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_SMALL_URL}) 2x, url(${ATLAS_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
    expect(atlasImageFor(64)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_SMALL_URL}) 2x, url(${ATLAS_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
    expect(atlasImageFor(72)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_URL}) 2x, url(${ATLAS_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
    expect(atlasImageFor(128)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_URL}) 2x, url(${ATLAS_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
  });
  it('어떤 크기·배율(1~4)에서도 128 atlas를 고른 경우 기기 픽셀은 128 이하', () => {
    for (let size = 8; size <= 200; size++) {
      const v = atlasImageFor(size);
      for (let r = 1; r <= 4; r++) {
        const small = v.startsWith('url(')
          ? v === `url(${ATLAS_SMALL_URL})`
          : v.includes(`url(${ATLAS_SMALL_URL}) ${r}x`);
        if (small) expect(size * r, `size ${size} @${r}x`).toBeLessThanOrEqual(128);
      }
    }
  });
  it('마스크(단일 주소)는 4배에서도 128 이하인 크기만 128 atlas', () => {
    expect(atlasMaskStyle(ATLAS_CODES[0]!, 32)!.maskImage).toBe(`url(${ATLAS_SMALL_URL})`);
    expect(atlasMaskStyle(ATLAS_CODES[0]!, 40)!.maskImage).toBe(`url(${ATLAS_URL})`);
  });
  it('배경 크기·위치는 종전과 같은 CSS px', () => {
    const s = atlasBgStyle(ATLAS_CODES[0]!, 48)!;
    expect(s.backgroundSize).toBe(`${3168 * (48 / 256)}px ${3168 * (48 / 256)}px`);
  });
});
