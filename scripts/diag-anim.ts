// 정밀 진단: 프레임별 (전체-opaque 정렬 오프셋) vs (안정본체만 정렬 오프셋) + 잔차.
// 안정본체 = 원본 불투명 & 저활성(움직이지 않는 부분). 리본/글로우 오염 여부 판별.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const W = 256, H = 256, N = W * H;
const R = 4;
const pid = process.argv[2];

async function rawOf(p: string): Promise<Buffer> {
  return sharp(p).ensureAlpha().resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
}

(async () => {
  const base = await rawOf(join(ROOT, 'public/sprites/pool', `${pid}.png`));
  const dir = join(ROOT, 'public/sprites/anim3-raw', pid);
  const files = readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  const frames = await Promise.all(files.map((f) => rawOf(join(dir, f))));

  // 활성도(프레임 간 변화 최대) → 안정마스크
  const act = new Float32Array(N);
  for (let p = 0; p < N; p++) { let mx = 0; for (const fr of frames) { const o = p * 4; const d = (Math.abs(fr[o] - base[o]) + Math.abs(fr[o + 1] - base[o + 1]) + Math.abs(fr[o + 2] - base[o + 2])) / 3; if (d > mx) mx = d; } act[p] = mx; }
  const stable = new Uint8Array(N); let stableCnt = 0;
  for (let p = 0; p < N; p++) { if (base[p * 4 + 3] > 40 && act[p] < 28) { stable[p] = 1; stableCnt++; } }

  function cost(fr: Buffer, sx: number, sy: number, mask: Uint8Array | null): number {
    let s = 0, c = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, bo = p * 4;
      if (mask ? !mask[p] : base[bo + 3] < 40) continue;
      const fx = x - sx, fy = y - sy;
      let d: number;
      if (fx < 0 || fx >= W || fy < 0 || fy >= H) d = 255;
      else { const fo = (fy * W + fx) * 4; d = (Math.abs(fr[fo] - base[bo]) + Math.abs(fr[fo + 1] - base[bo + 1]) + Math.abs(fr[fo + 2] - base[bo + 2])) / 3; }
      s += d; c++;
    }
    return s / Math.max(1, c);
  }
  function best(fr: Buffer, mask: Uint8Array | null) {
    let b = { c: Infinity, sx: 0, sy: 0 };
    for (let sy = -R; sy <= R; sy++) for (let sx = -R; sx <= R; sx++) { const c = cost(fr, sx, sy, mask); if (c < b.c) b = { c, sx, sy }; }
    return b;
  }

  // 상/하 영역 분리(손잡이=상단, 검신끝=하단) — 안정마스크를 y 중앙으로 나눔
  const upper = new Uint8Array(N), lower = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!stable[p]) continue; (y < H / 2 ? upper : lower)[p] = 1; }

  console.log(`[${pid}] 안정본체 ${stableCnt}/${N}`);
  console.log('frame | body정렬 | 본체잔차 | 상단(손잡이)잔차 | 하단(검신)잔차');
  for (let i = 0; i < frames.length; i++) {
    const bb = best(frames[i], stable);     // 본체 전체로 정렬
    const resid = cost(frames[i], bb.sx, bb.sy, stable);
    const rU = cost(frames[i], bb.sx, bb.sy, upper);  // 같은 오프셋에서 상단만
    const rL = cost(frames[i], bb.sx, bb.sy, lower);  // 같은 오프셋에서 하단만
    console.log(`  ${i}   | (${bb.sx},${bb.sy})   | ${resid.toFixed(1).padStart(5)}   | ${rU.toFixed(1).padStart(6)}           | ${rL.toFixed(1).padStart(6)}`);
  }
})();
