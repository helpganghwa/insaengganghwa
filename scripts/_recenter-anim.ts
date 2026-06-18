// 애니 본체 드리프트 제거(2D 리센터) — 각 프레임 본체 중심(cX,cY)을 기준값에 맞춰 평행이동.
// 핀과 달리 원본 애니 프레임 유지, 위치만 정렬(상하+좌우). 사용: bun run scripts/_recenter-anim.ts <key> [n]
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
if (!key) { console.error('usage: bun run scripts/_recenter-anim.ts <key> [n]'); process.exit(1); }
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;

function bbox(data: Buffer, ch: number) {
  let top = H, bot = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * ch + 3] > 200) { if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x; }
  }
  return { cx: (left + right) / 2, cy: (top + bot) / 2 };
}

const cxs: number[] = [], cys: number[] = [];
for (let i = 0; i < N; i++) {
  const { data, info } = await sharp(`${dir}/${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = bbox(data, info.channels); cxs.push(b.cx); cys.push(b.cy);
}
const med = (a: number[]) => Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]);
const tx = med(cxs), ty = med(cys);
console.log(`target cX=${tx} cY=${ty}`);
console.log(`before cX: ${cxs.map((c) => c.toFixed(1)).join(',')}`);
console.log(`before cY: ${cys.map((c) => c.toFixed(1)).join(',')}`);

for (let i = 0; i < N; i++) {
  const dx = Math.round(tx - cxs[i]), dy = Math.round(ty - cys[i]);
  if (dx === 0 && dy === 0) continue;
  const sx = Math.max(0, -dx), sy = Math.max(0, -dy);   // source crop offset
  const dxp = Math.max(0, dx), dyp = Math.max(0, dy);   // dest paste offset
  const cw = W - Math.abs(dx), chh = H - Math.abs(dy);
  const piece = await sharp(`${dir}/${i}.png`).extract({ left: sx, top: sy, width: cw, height: chh }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: dxp, top: dyp }])
    .png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`✓ ${key} 2D 리센터 완료`);
