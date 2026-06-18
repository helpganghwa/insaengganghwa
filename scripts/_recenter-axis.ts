// 축별 본체 드리프트 보정 — 발광에 둔감한 무게중심(centroid, 단단한 본체 alpha>=250)으로
// 각 프레임 본체 중심을 구해 지정 축만 기준값(중앙값)에 정렬한다.
// bbox는 글로우 몇 픽셀에도 끝이 늘어나 본체로 오인되지만, centroid는 큰 본체가 지배해 글로우에 강함.
// 사용: bun run scripts/_recenter-axis.ts <key> <axis: x|y|xy> [n]
import sharp from 'sharp';
const key = process.argv[2];
const axis = (process.argv[3] ?? 'xy') as 'x' | 'y' | 'xy';
const N = Number(process.argv[4] ?? 15);
if (!key) { console.error('usage: bun run scripts/_recenter-axis.ts <key> <axis:x|y|xy> [n]'); process.exit(1); }
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192, TH = 250; // 단단한 본체만(반투명 글로우 제외)

function centroid(data: Buffer, ch: number) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * ch + 3] >= TH) { sx += x; sy += y; n++; }
  }
  return n ? { cx: sx / n, cy: sy / n } : { cx: W / 2, cy: H / 2 };
}

const cxs: number[] = [], cys: number[] = [];
for (let i = 0; i < N; i++) {
  const { data, info } = await sharp(`${dir}/${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = centroid(data, info.channels); cxs.push(c.cx); cys.push(c.cy);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const tx = med(cxs), ty = med(cys);
console.log(`axis=${axis} target cX=${tx.toFixed(1)} cY=${ty.toFixed(1)}`);
console.log(`centroid cX: ${cxs.map((c) => c.toFixed(1)).join(',')}`);
console.log(`centroid cY: ${cys.map((c) => c.toFixed(1)).join(',')}`);

for (let i = 0; i < N; i++) {
  const dx = axis === 'y' ? 0 : Math.round(tx - cxs[i]);
  const dy = axis === 'x' ? 0 : Math.round(ty - cys[i]);
  if (dx === 0 && dy === 0) continue;
  const sx = Math.max(0, -dx), sy = Math.max(0, -dy);
  const dxp = Math.max(0, dx), dyp = Math.max(0, dy);
  const cw = W - Math.abs(dx), chh = H - Math.abs(dy);
  const piece = await sharp(`${dir}/${i}.png`).extract({ left: sx, top: sy, width: cw, height: chh }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: dxp, top: dyp }])
    .png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`✓ ${key} ${axis}축 centroid 리센터 완료`);
