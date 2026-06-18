// 모든 프레임의 불투명 본체 bbox(top,left)를 '중앙값' 위치로 맞춘다 — frame0 기준보다 이상치(튀는) 프레임 보정에 강함.
// 사용: bun run scripts/_align-median.ts <key> <n> [th]
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const TH = Number(process.argv[4] ?? 240);
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;
async function bbox(f: number) {
  const { data, info } = await sharp(`${dir}/${f}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; let top = H, left = W;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * ch + 3] >= TH) { if (y < top) top = y; if (x < left) left = x; }
  return { top, left, data, ch };
}
const fr: any[] = [];
for (let i = 0; i < N; i++) fr.push(await bbox(i));
const med = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mt = med(fr.map((f) => f.top)), ml = med(fr.map((f) => f.left));
const shifts: string[] = [];
for (let i = 0; i < N; i++) {
  const dy = mt - fr[i].top, dx = ml - fr[i].left;
  if (dy === 0 && dx === 0) continue;
  shifts.push(`${i}:(${dx},${dy})`);
  const sx = Math.max(0, -dx), sy = Math.max(0, -dy), dxp = Math.max(0, dx), dyp = Math.max(0, dy);
  const cw = W - Math.abs(dx), chh = H - Math.abs(dy);
  const piece = await sharp(`${dir}/${i}.png`).extract({ left: sx, top: sy, width: cw, height: chh }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: piece, left: dxp, top: dyp }]).png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`${key}: median-align (top=${mt},left=${ml}) shifted ${shifts.length}: ${shifts.join(' ')}`);
