/**
 * 포그 오브 워 구름바다 텍스처 베이킹 → public/sprites/guild/fog-clouds.png
 *
 * 사용: bun run scripts/bake-fog-texture.ts
 *
 * 월드맵의 미개방 지역을 덮는 정적 텍스처. SVG feTurbulence는 도메인 워핑이 불가해
 * 구름의 큰 소용돌이 구조를 못 만들므로(잔물결/치장벽토 느낌) 오프라인에서 직접 생성:
 *  - 그라디언트(Perlin) 노이즈 fbm 5옥타브 + 도메인 워핑(소용돌이 결)
 *  - 5단 팔레트 포스터라이즈 + Bayer 4×4 디더 — 맵 픽셀아트와 톤 일치
 *  - 저대비 한랭 남색(다크 UI 무드) — 안개는 배경으로 물러나고 개방 지역이 주인공
 * 의존성 없음(PNG 인코더 내장). 파라미터 변경 시 재실행하면 결정적으로 동일 출력.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ---------- 최소 PNG 인코더 (8bit RGB, filter 0) ----------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------- 그라디언트 노이즈 + fbm ----------
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144269504);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function gnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  // 퀸틱 보간 — 격자 경계에서 2차 미분까지 연속(셀 윤곽 억제)
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = g(xi, yi, xf, yf), n10 = g(xi + 1, yi, xf - 1, yf);
  const n01 = g(xi, yi + 1, xf, yf - 1), n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
  const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}
function fbm(x: number, y: number, seed: number, oct: number): number {
  let s = 0, amp = 0.5, fx = x, fy = y, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * gnoise(fx, fy, seed + i * 101);
    norm += amp;
    // 옥타브마다 좌표 회전+평행이동 — 축 정렬 줄무늬 방지
    const nx = fx * 1.58 - fy * 1.22, ny = fx * 1.22 + fy * 1.58;
    fx = nx + 7.31;
    fy = ny + 2.17;
    amp *= 0.52;
  }
  return 0.5 + (s / norm) * 0.72;
}
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------- 베이킹 ----------
const N = 256; // 390css 지도에 nearest 업스케일 — 맵 픽셀아트와 유사한 텍셀 밀도
const SC = 2.4; // 맵 폭당 대형 뭉게 ~2덩이 — 잘게 시끄럽지 않게
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16 - 0.5));
// 심연(골) → 구름 마루. 상한을 낮춘 저대비 한랭 남색 — 안개는 무대 커튼이지 주연이 아님
// (밝은 마루는 왕국과 시선 경쟁 + 같은 평면의 '벽'처럼 답답해짐).
const RAMP: [number, number, number][] = [
  [17, 21, 33],
  [27, 34, 50],
  [40, 50, 71],
  [56, 69, 95],
  [74, 90, 119],
];

const px = new Uint8Array(N * N * 3);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const u = (x / N) * SC, v = (y / N) * SC;
    // 도메인 워핑 — 좌표 자체를 노이즈로 비틀어 소용돌이 결 생성
    const wx = fbm(u + 13.2, v + 47.7, 7, 4) - 0.5;
    const wy = fbm(u + 91.1, v + 7.3, 19, 4) - 0.5;
    let d = fbm(u + 1.1 * wx, v + 1.1 * wy, 31, 5);
    d = smoothstep(0.37, 0.82, d); // 밝은 밴드 도달 픽셀 축소 — 전체적으로 가라앉힘
    // 포스터라이즈 + Bayer 디더 — 밴드 경계를 점묘로 풀어 픽셀아트 질감
    const t = Math.min(0.999, Math.max(0, d + BAYER[y % 4]![x % 4]! * (1 / (RAMP.length - 1)) * 0.35)); // 디더 0.35 — 폰 스케일 반점 노이즈 억제
    const band = Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1)));
    const c = RAMP[band]!;
    const o = (y * N + x) * 3;
    px[o] = c[0];
    px[o + 1] = c[1];
    px[o + 2] = c[2];
  }
}

const out = join(process.cwd(), 'public/sprites/guild/fog-clouds.png');
writeFileSync(out, encodePNG(N, N, px));
console.log(`[bake-fog-texture] ${N}×${N} → ${out}`);
