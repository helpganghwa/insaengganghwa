// 애니 프레임의 단단한 본체(불투명 alpha>200) 바운딩박스 측정 — 이동/스케일 진단용.
// 사용: bun run scripts/_anim-bbox.ts <key> [n]
import sharp from 'sharp';
const key = process.argv[2] ?? 'cuirass';
const N = Number(process.argv[3] ?? 15);
const dir = `public/sprites-test/anim-obj/${key}`;
for (let i = 0; i < N; i++) {
  const { data, info } = await sharp(`${dir}/${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let top = H, bot = -1, left = W, right = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * ch + 3];
    if (a > 200) { if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x; }
  }
  console.log(`f${i}: top=${top} bot=${bot} H=${bot - top + 1} cY=${((top + bot) / 2).toFixed(1)}`);
}
