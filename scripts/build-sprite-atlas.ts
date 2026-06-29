// Sprite atlas 빌드 — 150 PNG → 1 WebP atlas + JSON 좌표맵.
// 150 = 15×10 grid · cell 128px · atlas 1920×1280 (GDD §6 sprite 표준 = 128).
// 실행: bun run scripts/build-sprite-atlas.ts
// 결과: public/sprites/atlas.webp + public/sprites/atlas.json
//
// 클라이언트(TranscendSprite)는 atlas 1장만 다운로드해 모든 sprite를
// background-position(정적) 또는 drawImage 부분 그리기(canvas)로 렌더.
import sharp from 'sharp';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';

const CELL = 256; // 3차 소스가 256 네이티브 — 셀도 256으로(다운스케일 손실·셀 오버플로 방지).
// 셀 사이 투명 여백 — 축소 렌더(인벤 목록 등) 시 인접 셀이 경계로 새어나오는 bleeding
// 방지(2026-05-29). stride = CELL + GUTTER. atlasBgStyle은 cell로 crop하므로 누출
// 영역이 gutter(투명)에 떨어져 점이 안 보임.
const GUTTER = 8;
const STRIDE = CELL + GUTTER;
const COLS = 8;
const ROWS = 8; // 64셀(현재 60종 + 여유). 120 확장 시 grid 확대.

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
  const x = col * STRIDE;
  const y = row * STRIDE;
  // 입력을 정확히 CELL×CELL로 맞춤(contain·투명배경) — 소스 해상도가 달라도 셀 오버플로/잘림 방지.
  const cell = await sharp(file)
    .ensureAlpha()
    .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  composite.push({ input: cell, left: x, top: y });
  items[code] = { x, y };
  placed++;
}

const atlasW = COLS * STRIDE;
const atlasH = ROWS * STRIDE;
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
