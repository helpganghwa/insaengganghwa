// 강체 본체를 frame0에 마스크 정합으로 정밀 정렬 — centroid보다 잔여 ±1px 떨림에 강함.
// 각 프레임의 불투명 마스크(alpha>=TH)를 frame0과 비교, ±R px 범위에서 불일치 최소 이동을 찾아 평행이동.
// 사용: bun run scripts/_align-anim.ts <key> [n] [th] [r]
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const TH = Number(process.argv[4] ?? 200);
const R = Number(process.argv[5] ?? 3);
if (!key) { console.error('usage: _align-anim <key> [n] [th] [r]'); process.exit(1); }
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;
async function mask(f: number) {
  const { data, info } = await sharp(`${dir}/${f}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = data[i * ch + 3] >= TH ? 1 : 0;
  return m;
}
const ref = await mask(0);
function score(m: Uint8Array, dx: number, dy: number) {
  let s = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xx = x + dx, yy = y + dy;
    const v = (xx >= 0 && xx < W && yy >= 0 && yy < H) ? m[yy * W + xx] : 0;
    if (v !== ref[y * W + x]) s++;
  }
  return s;
}
const shifts: string[] = [];
for (let i = 0; i < N; i++) {
  const m = await mask(i);
  let best = 1e9, bdx = 0, bdy = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const s = score(m, dx, dy); if (s < best) { best = s; bdx = dx; bdy = dy; } }
  const mx = -bdx, my = -bdy; // 본체를 ref에 맞추는 이동
  shifts.push(`${i}:(${mx},${my})`);
  if (mx === 0 && my === 0) continue;
  const sx = Math.max(0, -mx), sy = Math.max(0, -my);
  const dxp = Math.max(0, mx), dyp = Math.max(0, my);
  const cw = W - Math.abs(mx), chh = H - Math.abs(my);
  const piece = await sharp(`${dir}/${i}.png`).extract({ left: sx, top: sy, width: cw, height: chh }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: dxp, top: dyp }]).png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`✓ ${key} 마스크정렬: ${shifts.join(' ')}`);
