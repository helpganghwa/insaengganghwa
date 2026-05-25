// 마스코트 PNG에서 머리+어깨 영역만 추출 (사전 처리).
// 7등신 캐릭터 → 머리+어깨 ≈ 상단 32%. alpha 분석으로 정확히 bbox 추출.
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const DIRECTIONS = ['south', 'south-east', 'south-west', 'east', 'west', 'north', 'north-east', 'north-west'];
const ROOT = 'public/sprites/characters';

async function bbox(src: string): Promise<{ top: number; bustH: number; left: number; right: number }> {
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  let topY = 0;
  outer1: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3]! > 16) { topY = y; break outer1; }
    }
  }
  let bottomY = h - 1;
  outer2: for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3]! > 16) { bottomY = y; break outer2; }
    }
  }
  const fullH = bottomY - topY + 1;
  // 머리 + 어깨 + 가슴 일부까지 = 상단 ~50% (RPG bust 표준).
  const bustH = Math.round(fullH * 0.5);
  let left = w;
  let right = 0;
  for (let y = topY; y < topY + bustH; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3]! > 16) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { top: topY, bustH, left, right };
}

for (const d of DIRECTIONS) {
  const src = `${ROOT}/user-mascot-${d}.png`;
  if (!existsSync(src)) {
    console.log(`${d}: skip (file not found)`);
    continue;
  }
  try {
    const { top, bustH, left, right } = await bbox(src);
    const w = right - left + 1;
    const dst = `${ROOT}/user-mascot-bust-${d}.png`;
    await sharp(src).extract({ left, top, width: w, height: bustH }).png().toFile(dst);
    const out = await sharp(dst).metadata();
    console.log(`${d}: ${out.width}x${out.height} (top=${top} h=${bustH} x=[${left},${right}])`);
  } catch (e) {
    console.error(`${d}:`, (e as Error).message);
  }
}
