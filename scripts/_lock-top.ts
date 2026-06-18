// 상단 영역(예: 링)을 idle에서 고정 합성하고, 하단 영역(예: 매달린 깃털)만 애니 프레임에서 가져온다.
// → 상단은 프레임마다 픽셀 동일(크기·위치·발광 불변), 하단만 움직임.
// fit-frame 적용 후(= idle과 프레임이 동일 스케일/오프셋)에 실행해야 정합이 맞는다.
// 사용: bun run scripts/_lock-top.ts <key> <n> <fracY>   (fracY=0~1, 이 비율 위쪽을 idle로 고정)
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const frac = Number(process.argv[4] ?? 0.58);
if (!key) { console.error('usage: _lock-top <key> <n> <fracY>'); process.exit(1); }
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;
const splitY = Math.round(H * frac);

const idle = await sharp(`${dir}/idle.png`).ensureAlpha().raw().toBuffer();
for (let i = 0; i < N; i++) {
  const fr = await sharp(`${dir}/${i}.png`).ensureAlpha().raw().toBuffer();
  const out = Buffer.from(fr);
  // 상단 [0, splitY)을 idle로 덮어쓰기
  for (let y = 0; y < splitY; y++) {
    const row = y * W * 4;
    idle.copy(out, row, row, row + W * 4);
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${dir}/${i}.png`);
}
console.log(`${key}: lock-top ${Math.round(frac * 100)}% (rows 0..${splitY} = idle 고정) — ${N} frames`);
