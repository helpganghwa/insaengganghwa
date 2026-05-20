// Sprite atlas 빌드 — 150 PNG → 1 WebP atlas + JSON 좌표맵.
// 150 = 15×10 grid · cell 64px · atlas 960×640.
// 실행: bun run scripts/build-sprite-atlas.ts
// 결과: public/sprites/atlas.webp + public/sprites/atlas.json
//
// 클라이언트(TranscendSprite)는 atlas 1장만 다운로드해 모든 sprite를
// background-position(정적) 또는 drawImage 부분 그리기(canvas)로 렌더.
import sharp from 'sharp';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';

const CELL = 64;
const COLS = 15;
const ROWS = 10; // 150 정확. 늘리려면 row 추가.

const PUB = join(process.cwd(), 'public');
const OUT_WEBP = join(PUB, 'sprites', 'atlas.webp');
const OUT_JSON = join(PUB, 'sprites', 'atlas.json');

const codes = Object.keys(SPRITE_MANIFEST).sort();
if (codes.length > COLS * ROWS) {
  throw new Error(`${codes.length} sprites > ${COLS * ROWS} cells — atlas grid 늘려야 함`);
}

type Coord = { x: number; y: number };
const items: Record<string, Coord> = {};
const composite: sharp.OverlayOptions[] = [];

let placed = 0;
for (let i = 0; i < codes.length; i++) {
  const code = codes[i]!;
  const rel = SPRITE_MANIFEST[code]!;
  const file = join(PUB, rel);
  if (!existsSync(file)) {
    console.warn(`  missing: ${rel}`);
    continue;
  }
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * CELL;
  const y = row * CELL;
  composite.push({ input: file, left: x, top: y });
  items[code] = { x, y };
  placed++;
}

const atlasW = COLS * CELL;
const atlasH = ROWS * CELL;
console.log(`composing ${placed}/${codes.length} sprites → ${atlasW}×${atlasH}`);

const base = sharp({
  create: {
    width: atlasW,
    height: atlasH,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
});
const buf = await base.composite(composite).webp({ lossless: true, effort: 6 }).toBuffer();
writeFileSync(OUT_WEBP, buf);
console.log(`✓ ${OUT_WEBP} (${(buf.length / 1024).toFixed(1)} KiB)`);

const atlas = { size: { w: atlasW, h: atlasH }, cell: CELL, items };
writeFileSync(OUT_JSON, JSON.stringify(atlas));
console.log(`✓ ${OUT_JSON} (${placed} items)`);
