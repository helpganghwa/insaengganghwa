// 수동 정렬 보정값 적용 — align-anim3.html에서 내보낸 JSON을 받아 각 아이템 스트립에
// 프레임별 평행이동(dx,dy)만 가해 재합성(스크립트=위치보정만 원칙 준수, 픽셀 락/합성 없음).
// 사용: bun run scripts/apply-align.ts <offsets.json>
//   offsets.json = { "<id>": [[dx,dy], ...프레임수], ... }
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const W = 256, H = 256, N = W * H;
const file = process.argv[2];
if (!file) { console.error('사용: bun run scripts/apply-align.ts <offsets.json>'); process.exit(1); }
const offsets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, [number, number][]>;

function shift(buf: Buffer, sx: number, sy: number): Buffer {
  const out = Buffer.alloc(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x - sx, fy = y - sy; if (fx < 0 || fx >= W || fy < 0 || fy >= H) continue;
    const oo = (y * W + x) * 4, fo = (fy * W + fx) * 4;
    out[oo] = buf[fo]; out[oo + 1] = buf[fo + 1]; out[oo + 2] = buf[fo + 2]; out[oo + 3] = buf[fo + 3];
  }
  return out;
}

for (const id of Object.keys(offsets)) {
  const p = join(ROOT, 'public/sprites/anim3', `${id}.webp`);
  const { data, info } = await sharp(p).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const cols = Math.round(info.width / W);
  const offs = offsets[id];
  const tiles: sharp.OverlayOptions[] = [];
  for (let i = 0; i < cols; i++) {
    const fr = Buffer.alloc(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const so = (y * info.width + (i * W + x)) * 4, doo = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) fr[doo + c] = data[so + c];
    }
    const [dx, dy] = offs[i] ?? [0, 0];
    const moved = (dx || dy) ? shift(fr, dx, dy) : fr;
    tiles.push({ input: await sharp(moved, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), left: i * W, top: 0 });
  }
  const strip = await sharp({ create: { width: cols * W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles).webp({ lossless: true, effort: 6 }).toBuffer();
  writeFileSync(p, strip);
  console.log(`[${id}] ${cols}프레임 평행이동 적용: ${offs.map((o) => `(${o[0]},${o[1]})`).join('')}`);
}
console.log(`완료 ${Object.keys(offsets).length}종`);
