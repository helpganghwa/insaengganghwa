// 사각 프레임 빈공간 최소화 — 오브젝트를 프레임에 꽉 차게 정규화.
// 폴더 내 idle + 0..n-1 프레임의 합집합 bbox를 구해 동일한 크롭/스케일을 모든 프레임에 적용
// → 애니 흔들림/크기 점프 없이 일관되게 프레임을 채움. 픽셀은 nearest로 또렷하게 유지.
// 사용: bun run scripts/_fit-frame.ts <key> [n] [fill%]   (n=0이면 idle만)
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const FILL = Number(process.argv[4] ?? 92) / 100; // 프레임 대비 채움 비율
if (!key) { console.error('usage: bun run scripts/_fit-frame.ts <key> [n] [fill%]'); process.exit(1); }
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192, A = 16; // 보이는 픽셀(글로우 포함) 기준
const files = ['idle', ...Array.from({ length: N }, (_, i) => String(i))];

function bbox(data: Buffer, ch: number) {
  let top = H, bot = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * ch + 3] >= A) { if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x; }
  }
  return { top, bot, left, right };
}

// 합집합 bbox
let T = H, Bm = -1, L = W, R = -1;
for (const f of files) {
  const { data, info } = await sharp(`${dir}/${f}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = bbox(data, info.channels);
  if (b.bot < 0) continue;
  T = Math.min(T, b.top); Bm = Math.max(Bm, b.bot); L = Math.min(L, b.left); R = Math.max(R, b.right);
}
const bw = R - L + 1, bh = Bm - T + 1;
const target = Math.round(W * FILL);
const scale = Math.min(target / bw, target / bh);
const nw = Math.max(1, Math.round(bw * scale)), nh = Math.max(1, Math.round(bh * scale));
const offX = Math.round((W - nw) / 2), offY = Math.round((H - nh) / 2);
console.log(`${key}: bbox ${bw}x${bh} @(${L},${T}) → scale ${scale.toFixed(2)} → ${nw}x${nh} centered`);

for (const f of files) {
  const piece = await sharp(`${dir}/${f}.png`)
    .extract({ left: L, top: T, width: bw, height: bh })
    .resize(nw, nh, { kernel: 'nearest' })
    .png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: offX, top: offY }])
    .png().toBuffer();
  await sharp(out).toFile(`${dir}/${f}.png`);
}
console.log(`✓ ${key} 프레임 채움(${Math.round(FILL * 100)}%) 완료`);
