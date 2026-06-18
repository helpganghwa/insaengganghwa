// 후광(상단 중앙·금빛 밝은 픽셀)만 골라 프레임별로 카운트 — 후광이 사라진 프레임 탐지.
// 사용: bun run scripts/_halo-check.ts <key> [n]
import sharp from 'sharp';
const key = process.argv[2] ?? 'angel_armor';
const N = Number(process.argv[3] ?? 15);
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;
const y0 = 0, y1 = Math.floor(H * 0.30), x0 = Math.floor(W * 0.28), x1 = Math.floor(W * 0.72);
for (let i = 0; i < N; i++) {
  const { data, info } = await sharp(`${dir}/${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; let bright = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * W + x) * ch, r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a > 60 && r > 150 && g > 110 && b < 160) bright++; // 금빛 후광
  }
  console.log(`f${i}: 후광(금빛) ${bright}`);
}
