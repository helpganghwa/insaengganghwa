import 'server-only';

import sharp from 'sharp';

/**
 * 캐릭터 외곽의 흰 점 노이즈 제거. "흰색인데 주변이 흰색이 아니고 배경(투명)에 인접한"
 * 고립 흰 픽셀만 투명화 — 캐릭터의 의도적 흰색은 보존:
 *  - 흰 옷/금속: 주변도 흰색(밝은 이웃 많음) → 유지
 *  - 눈 하이라이트: 캐릭터 내부(투명 이웃 없음) → 유지
 *  - 외곽 흰점: 투명 인접 + 밝은 이웃 적음 → 제거
 */
const ALPHA_ON = 40;
const WHITE = 200; // 이 이상 RGB = 흰색/밝은 픽셀로 간주(안티앨리어싱 잔여 포함)
const MAX_BRIGHT_NEIGHBORS = 3; // 밝은 이웃이 이 미만이면 고립

export async function cleanupSprite(pngBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const isWhite = (i: number) =>
    data[i + 3]! > ALPHA_ON && data[i]! >= WHITE && data[i + 1]! >= WHITE && data[i + 2]! >= WHITE;

  const toClear: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isWhite(i)) continue;
      let bright = 0;
      let transparent = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
            transparent++;
            continue;
          }
          const ni = (ny * W + nx) * 4;
          if (data[ni + 3]! <= ALPHA_ON) transparent++;
          else if (isWhite(ni)) bright++;
        }
      }
      // 흰색인데 주변에 흰색이 적고(고립) 배경(투명)에 닿아 있으면 외곽 노이즈.
      if (bright < MAX_BRIGHT_NEIGHBORS && transparent >= 1) toClear.push(i);
    }
  }

  if (toClear.length === 0) return pngBuf;
  for (const i of toClear) data[i + 3] = 0;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
