// 프레임 하단의 '넓은 가로줄(그림자 바)' 제거 — 바로 위 내용(자루 등)보다 폭이 급격히 넓은 하단 행을 투명화.
// 사용: bun run scripts/_strip-darkrow.ts <key> <n>
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const dir = `public/sprites-test/anim-obj/${key}`;
const files = ['idle', ...Array.from({ length: N }, (_, i) => String(i))];
for (const f of files) {
  const { data, info } = await sharp(`${dir}/${f}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const cnt = (y: number) => { let n = 0; for (let x = 0; x < W; x++) if (data[(y * W + x) * C + 3] > 40) n++; return n; };
  let cleared = 0;
  // 하단 18행만 검사
  for (let y = H - 1; y >= H - 18; y--) {
    const c = cnt(y);
    if (c < 20) continue;
    // 바로 위 3~6행 평균 폭
    let above = 0, k = 0;
    for (let yy = y - 6; yy <= y - 3; yy++) { if (yy >= 0) { above += cnt(yy); k++; } }
    above = k ? above / k : 0;
    if (c >= 24 && c > above * 2.2) { // 위보다 2.2배 넓은 바 → 제거
      for (let x = 0; x < W; x++) { const p = (y * W + x) * C; data[p + 3] = 0; }
      cleared++;
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toFile(`${dir}/${f}.png`);
  if (f === '4') console.log(`${key}/${f}: cleared ${cleared} bar rows`);
}
console.log(`${key}: dark-row strip done`);
