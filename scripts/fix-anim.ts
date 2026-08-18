// 애니 후처리(최종): ① 안정본체 기준 평행이동 정렬 → ② 정지영역(저활성)을 원본에 고정,
//   움직이는 영역(리본/글로우=고활성)만 애니. 전역지터 + 국소비강체흔들림 모두 제거.
// 사용: bun run scripts/fix-anim.ts <pool_id...> [--floor=0] [--amp=1] [--lock=x0,y0,x1,y1] [--lockbody] [--inplace]
// 입력: public/sprites/pool/<id>.png, public/sprites/anim3-raw/<id>/<i>.png
// 출력: inplace→ public/sprites/anim3/<id>.webp / 아니면 /tmp/<id>_fix.webp
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const W = 256, H = 256, N = W * H;
const R = 4;                 // 정렬 탐색 범위(px)
const T_STABLE = 28;         // 안정(정지) 판정: 활성 < 이 값
const T_MOVE = 10;         // 애니 영역 판정(낮을수록 미묘한 발광도 보존)
const args = process.argv.slice(2);
const FLOOR = Number((args.find((a) => a.startsWith('--floor='))?.split('=')[1]) ?? 0); // 정지영역에 남길 움직임(0=완전고정)
// 움직임 세기 배율. 프레임을 원본 쪽으로 당겨 진폭만 줄인다 — "동작은 맞는데 과하다"를
// 재생성 없이 낮추는 손잡이(1=원본 그대로, 0.5=절반).
const AMP = Number((args.find((a) => a.startsWith('--amp='))?.split('=')[1]) ?? 1);
// 강제 고정 사각형. 활성도가 전면적으로 높아(모델이 매 프레임 본체를 다시 그려서) 자동
// 마스크가 본체를 못 잡을 때, 부위를 직접 지정해 원본에 못 박는다. [x0,y0,x1,y1] 포함 범위.
const LOCK = (args.find((a) => a.startsWith('--lock='))?.split('=')[1] ?? '')
  .split(',').filter(Boolean).map(Number);
// 원본 실루엣 전체를 고정 — 본체는 한 픽셀도 안 변하고, 실루엣 밖(떨어지는 깃·날리는 파편)만
// 애니된다. 모델이 매 프레임 본체 색까지 바꿔버릴 때 유일하게 확실한 방법.
const LOCKBODY = args.includes('--lockbody');
const INPLACE = args.includes('--inplace');
const ids = args.filter((a) => !a.startsWith('--'));

async function rawOf(p: string): Promise<Buffer> {
  return sharp(p).ensureAlpha().resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
}
function activityMap(base: Buffer, frames: Buffer[]): Float32Array {
  const act = new Float32Array(N);
  for (let p = 0; p < N; p++) { let mx = 0; const o = p * 4; for (const fr of frames) { const d = (Math.abs(fr[o] - base[o]) + Math.abs(fr[o + 1] - base[o + 1]) + Math.abs(fr[o + 2] - base[o + 2])) / 3; if (d > mx) mx = d; } act[p] = mx; }
  return act;
}
function cost(base: Buffer, fr: Buffer, sx: number, sy: number, mask: Uint8Array | null): number {
  let s = 0, c = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, bo = p * 4;
    if (mask ? !mask[p] : base[bo + 3] < 40) continue;
    const fx = x - sx, fy = y - sy;
    let d: number;
    if (fx < 0 || fx >= W || fy < 0 || fy >= H) d = 255;
    else { const fo = (fy * W + fx) * 4; d = Math.abs(fr[fo] - base[bo]) + Math.abs(fr[fo + 1] - base[bo + 1]) + Math.abs(fr[fo + 2] - base[bo + 2]); }
    s += d; c++;
  }
  return s / Math.max(1, c);
}
function shift(fr: Buffer, sx: number, sy: number): Buffer {
  const out = Buffer.alloc(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x - sx, fy = y - sy; if (fx < 0 || fx >= W || fy < 0 || fy >= H) continue;
    const oo = (y * W + x) * 4, fo = (fy * W + fx) * 4;
    out[oo] = fr[fo]; out[oo + 1] = fr[fo + 1]; out[oo + 2] = fr[fo + 2]; out[oo + 3] = fr[fo + 3];
  }
  return out;
}

/**
 * 원본 스프라이트 경로 — 레거시 seed 배치는 sprites/pool/<id>.png 한곳이지만,
 * V4 확장분은 슬롯별(sprites/<slot>/<key>.png)에 있다. 있는 쪽을 쓴다.
 */
function basePath(pid: string): string {
  const pool = join(ROOT, 'public/sprites/pool', `${pid}.png`);
  if (existsSync(pool)) return pool;
  // weapon-cand = 교체 후보(미채택). 채택 시 weapon/으로 옮겨지면 위 경로로 잡힌다.
  for (const slot of ['weapon', 'armor', 'accessory', 'weapon-cand']) {
    const p = join(ROOT, 'public/sprites', slot, `${pid}.png`);
    if (existsSync(p)) return p;
  }
  throw new Error(`원본 스프라이트 없음: ${pid}`);
}

export async function fixOne(pid: string, inplace = INPLACE, floor = FLOOR, amp = AMP, lock: number[] = LOCK, lockBody = LOCKBODY): Promise<string> {
  const base = await rawOf(basePath(pid));
  const dir = join(ROOT, 'public/sprites/anim3-raw', pid);
  const files = readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  const frames = await Promise.all(files.map((f) => rawOf(join(dir, f))));

  // ① 정렬 — 안정본체(opaque & 저활성)로만
  const actRaw = activityMap(base, frames);
  const stable = new Uint8Array(N); let scnt = 0;
  for (let p = 0; p < N; p++) if (base[p * 4 + 3] > 40 && actRaw[p] < T_STABLE) { stable[p] = 1; scnt++; }
  const amask = scnt >= 200 ? stable : null;
  const offs: string[] = [];
  const aligned = frames.map((fr) => {
    let b = { c: Infinity, sx: 0, sy: 0 };
    for (let sy = -R; sy <= R; sy++) for (let sx = -R; sx <= R; sx++) { const c = cost(base, fr, sx, sy, amask); if (c < b.c) b = { c, sx, sy }; }
    offs.push(`(${b.sx},${b.sy})`);
    return shift(fr, b.sx, b.sy);
  });

  // ② 정렬본 기준 활성 재계산 → 움직임 마스크(고활성)만 애니, 나머지 원본 고정
  const actA = activityMap(base, aligned);
  const actBuf = Buffer.alloc(N); for (let p = 0; p < N; p++) actBuf[p] = Math.min(255, actA[p]);
  const bin = await sharp(actBuf, { raw: { width: W, height: H, channels: 1 } }).blur(1.5).threshold(T_MOVE).toBuffer();
  const moveAlpha = await sharp(bin, { raw: { width: W, height: H, channels: 1 } }).blur(3).toBuffer();

  // 자동 폴백: 정렬 후에도 모션이 있는데(드리프트 제거 후 남은 효과) 락(floor<1)이 그걸 거의 다 가두면
  //   → 효과가 통째로 사라짐. 그 경우 정렬만(floor 1)으로 전환해 모션 보존.
  let alignedMotion = 0;
  for (let i = 1; i < aligned.length; i++) { let s = 0; const a = aligned[i], b = aligned[i - 1]; for (let k = 0; k < N * 4; k++) s += Math.abs(a[k] - b[k]); alignedMotion += s / (N * 4); }
  alignedMotion /= Math.max(1, aligned.length - 1);
  let moveSum = 0; for (let p = 0; p < N; p++) moveSum += moveAlpha[p];
  const moveFrac = moveSum / (255 * N);
  let effFloor = floor;
  if (floor < 1 && alignedMotion > 1.2 && moveFrac < 0.005) { effFloor = 1; console.log(`  ↳ ${pid}: 락이 모션을 가둠(motion ${alignedMotion.toFixed(1)}, move ${(moveFrac * 100).toFixed(2)}%) → 정렬만(floor 1) 폴백`); }

  if (lockBody) for (let p = 0; p < N; p++) if (base[p * 4 + 3] >= 40) moveAlpha[p] = 0;
  if (lock.length === 4) {
    const [x0, y0, x1, y1] = lock;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) moveAlpha[y * W + x] = 0;
  }

  const tiles: sharp.OverlayOptions[] = [];
  for (let i = 0; i < aligned.length; i++) {
    const out = Buffer.alloc(N * 4); const fr = aligned[i];
    for (let p = 0; p < N; p++) {
      const a = (effFloor + (1 - effFloor) * (moveAlpha[p] / 255)) * amp, ia = 1 - a, o = p * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(base[o + c] * ia + fr[o + c] * a);
    }
    tiles.push({ input: await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), left: i * W, top: 0 });
  }
  const strip = await sharp({ create: { width: aligned.length * W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles).webp({ lossless: true, effort: 6 }).toBuffer();

  const outPath = inplace ? join(ROOT, 'public/sprites/anim3', `${pid}.webp`) : join('/tmp', `${pid}_f${String(floor).replace('.', '')}.webp`);
  writeFileSync(outPath, strip);
  console.log(`[${pid}]${inplace ? ' inplace' : ''} 정렬 ${offs.join('')} | 안정 ${scnt} | floor ${floor}${amp !== 1 ? ` | amp ${amp}` : ''}${lock.length === 4 ? ` | lock ${lock.join(',')}` : ''}${lockBody ? ' | lockbody' : ''}`);
  return outPath;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/fix-anim.ts')) {
  (async () => {
    let ok = 0; const bad: string[] = [];
    for (const id of ids) {
      try { await fixOne(id, INPLACE, FLOOR, AMP, LOCK, LOCKBODY); ok++; } catch (e) { bad.push(id); console.error(`  ✗ ${id}: ${(e as Error).message.slice(0, 80)}`); }
    }
    console.log(`재처리 ${ok}/${ids.length}` + (bad.length ? ` · 실패 ${bad.length}: ${bad.join(', ')}` : ''));
  })();
}
