// mascot-supply (선물 들고 있는 상태) PNG에서 머리+팔(선물)까지 crop.
// 손이 가슴 앞에 있어서 비율 0.55 (bust보다 약간 더 아래까지).
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const DIRECTIONS = ['south', 'south-east', 'south-west', 'east', 'west', 'north', 'north-east', 'north-west'];
const ROOT = 'public/sprites/characters';
const PREFIX = process.argv[2] ?? 'mascot-supply';

async function bbox(src: string): Promise<{ top: number; cropH: number; left: number; right: number }> {
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
  // 머리+팔(선물 든 손)까지 = 상단 ~55% (bust 0.5보다 약간 더)
  const cropH = Math.round(fullH * 0.55);
  let left = w;
  let right = 0;
  for (let y = topY; y < topY + cropH; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3]! > 16) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { top: topY, cropH, left, right };
}

for (const d of DIRECTIONS) {
  const src = `${ROOT}/${PREFIX}-${d}.png`;
  if (!existsSync(src)) {
    console.log(`${d}: skip`);
    continue;
  }
  try {
    const { top, cropH, left, right } = await bbox(src);
    const w = right - left + 1;
    const dst = `${ROOT}/${PREFIX}-bust-${d}.png`;
    await sharp(src).extract({ left, top, width: w, height: cropH }).png().toFile(dst);
    const out = await sharp(dst).metadata();
    console.log(`${d}: ${out.width}x${out.height} (top=${top} h=${cropH})`);
  } catch (e) {
    console.error(`${d}:`, (e as Error).message);
  }
}
