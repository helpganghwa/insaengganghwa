// Pixellab 캐릭터 PNG의 누끼 흰 fringe 제거.
// 1) alpha < 200 픽셀 → alpha=0 (semi-transparent 경계 제거)
// 2) 거의 흰색이면서 alpha < 255인 픽셀 → alpha=0 (흰 outline 제거)
//
// 실행: bun run scripts/_strip-char-fringe.ts

import sharp from 'sharp';
import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'fx');
const ALPHA_THRESHOLD = 200; // 이하면 완전 투명
const WHITE_THRESHOLD = 230; // r,g,b 모두 이 값 이상 + alpha<255면 fringe로 간주

const files = readdirSync(DIR)
  .filter((f) => f.startsWith('char-') && f.endsWith('.png'))
  .filter((f) => !f.endsWith('.bak.png'));

for (const f of files) {
  const path = join(DIR, f);
  const bakPath = path.replace(/\.png$/, '.fringe.bak.png');
  if (!existsSync(bakPath)) writeFileSync(bakPath, readFileSync(path));

  const img = sharp(path);
  const meta = await img.metadata();
  const { width, height } = meta;
  if (!width || !height) {
    console.warn(`skip ${f} — no metadata`);
    continue;
  }

  const buf = await img.raw().toBuffer();
  let stripped = 0;
  const EDGE_WHITE = 220; // outline 옆 흰 픽셀 판정 임계
  // 1차: semi-transparent + 흰색 fringe 제거
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i]!;
    const g = buf[i + 1]!;
    const b = buf[i + 2]!;
    const a = buf[i + 3]!;
    if (a === 0 || a === 255) continue;
    if (a < ALPHA_THRESHOLD || (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD)) {
      buf[i + 3] = 0;
      stripped++;
    }
  }
  // 2차: alpha=255 흰 픽셀 중 4방향 이웃에 alpha=0이 있는 = outline 옆 누끼 잘못된 점
  // 캐릭터 내부 흰자위/하이라이트는 사방이 다른 색으로 둘러싸여 있어 안전.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (buf[i + 3] !== 255) continue;
      const r = buf[i]!;
      const g = buf[i + 1]!;
      const b = buf[i + 2]!;
      if (r < EDGE_WHITE || g < EDGE_WHITE || b < EDGE_WHITE) continue;
      // 4방향 이웃에 alpha=0 있으면 누끼 잘못된 점
      let hasTransNeighbor = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (buf[(ny * width + nx) * 4 + 3] === 0) {
          hasTransNeighbor = true;
          break;
        }
      }
      if (hasTransNeighbor) {
        buf[i + 3] = 0;
        stripped++;
      }
    }
  }
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path);
  console.log(`✓ ${f} — ${stripped} fringe px stripped`);
}
console.log(`\n${files.length} files processed`);
