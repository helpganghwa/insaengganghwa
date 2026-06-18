// 불투명 마스크의 질량중심(centroid)을 한 축(v=세로 / h=가로)만 '중앙값' 위치로 맞춘다.
// bbox가 못 잡는 '본체 전체가 위아래(또는 좌우)로 흔들리는' 움직임 제거용.
// 사용: bun run scripts/_align-axis.ts <key> <n> <v|h> [th]
import sharp from 'sharp';
const key = process.argv[2];
const N = Number(process.argv[3] ?? 15);
const AXIS = (process.argv[4] ?? 'v') as 'v' | 'h';
const TH = Number(process.argv[5] ?? 60);
const dir = `public/sprites-test/anim-obj/${key}`;
const W = 192, H = 192;
async function centroid(f: number) {
  const { data, info } = await sharp(`${dir}/${f}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; let sx = 0, sy = 0, cnt = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * ch + 3] >= TH) { sx += x; sy += y; cnt++; }
  return { cx: sx / cnt, cy: sy / cnt };
}
const c: any[] = [];
for (let i = 0; i < N; i++) c.push(await centroid(i));
const med = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mc = AXIS === 'v' ? med(c.map((p) => p.cy)) : med(c.map((p) => p.cx));
const shifts: string[] = [];
for (let i = 0; i < N; i++) {
  const dx = AXIS === 'h' ? Math.round(mc - c[i].cx) : 0;
  const dy = AXIS === 'v' ? Math.round(mc - c[i].cy) : 0;
  if (dx === 0 && dy === 0) continue;
  shifts.push(`${i}:(${dx},${dy})`);
  const sx = Math.max(0, -dx), sy = Math.max(0, -dy), dxp = Math.max(0, dx), dyp = Math.max(0, dy);
  const cw = W - Math.abs(dx), chh = H - Math.abs(dy);
  const piece = await sharp(`${dir}/${i}.png`).extract({ left: sx, top: sy, width: cw, height: chh }).png().toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: piece, left: dxp, top: dyp }]).png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`${key}: axis-${AXIS} align (median=${mc.toFixed(1)}) shifted ${shifts.length}: ${shifts.join(' ')}`);
