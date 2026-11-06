import { describe, expect, it } from 'vitest';

import { ATLAS_SMALL_URL, ATLAS_URL, atlasBgStyle, atlasImageFor, ATLAS_CODES } from '@/lib/game/equipment/sprite-atlas';

/** 반 해상도 atlas 선택(2026-11-06 업데이트 18) — 기기 픽셀 144 이하만 128 atlas, 위치·크기 값은 그대로. */
describe('atlasImageFor', () => {
  it('해시 파일명(쿼리 캐시 무효화 아님)', () => {
    expect(ATLAS_SMALL_URL).toMatch(/^\/sprites\/atlas-128-[0-9a-f]{8}\.webp$/);
    expect(ATLAS_URL).toMatch(/^\/sprites\/atlas-[0-9a-f]{8}\.webp$/);
  });
  it('36px 이하는 항상 128, 73px 이상은 항상 원본', () => {
    expect(atlasImageFor(26)).toBe(`url(${ATLAS_SMALL_URL})`);
    expect(atlasImageFor(36)).toBe(`url(${ATLAS_SMALL_URL})`);
    expect(atlasImageFor(73)).toBe(`url(${ATLAS_URL})`);
    expect(atlasImageFor(144)).toBe(`url(${ATLAS_URL})`);
  });
  it('37~72px는 배율별 — 기기 픽셀 144 이하 배율만 128', () => {
    expect(atlasImageFor(48)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_SMALL_URL}) 2x, url(${ATLAS_SMALL_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
    expect(atlasImageFor(64)).toBe(
      `-webkit-image-set(url(${ATLAS_SMALL_URL}) 1x, url(${ATLAS_SMALL_URL}) 2x, url(${ATLAS_URL}) 3x, url(${ATLAS_URL}) 4x)`,
    );
  });
  it('배경 크기·위치는 종전과 같은 CSS px', () => {
    const s = atlasBgStyle(ATLAS_CODES[0]!, 48)!;
    expect(s.backgroundSize).toBe(`${3168 * (48 / 256)}px ${3168 * (48 / 256)}px`);
  });
});
