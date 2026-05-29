// 아이템 스프라이트 floating 노이즈 제거 — 8-connected 연결성분 라벨링으로
// 메인 아트와 분리돼 떠다니는 작은 픽셀 덩어리(색 무관)를 투명화.
// 분석:  bun run scripts/clean-sprite-noise.ts
// 적용:  bun run scripts/clean-sprite-noise.ts --apply
// 적용 후 atlas 재생성 필요: bun run scripts/build-sprite-atlas.ts

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

const APPLY = process.argv.includes('--apply');
const SLOTS = ['weapon', 'armor', 'accessory'] as const;
const SPRITES_DIR = join(process.cwd(), 'public', 'sprites');
const ALPHA_ON = 40; // 이 alpha 초과 = 불투명(아트) 픽셀
const MIN_COMPONENT_PX = 8; // 이 미만 + 메인과 분리된 고립 덩어리 = 노이즈

interface Comp {
  pixels: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

async function processFile(path: string): Promise<{ removed: number; noiseComps: number[] }> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const N = W * H;
  const label = new Int32Array(N).fill(-1);
  const on = (p: number) => data[p * 4 + 3]! > ALPHA_ON;

  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let start = 0; start < N; start++) {
    if (!on(start) || label[start] !== -1) continue;
    const cid = comps.length;
    const c: Comp = { pixels: [], minX: W, maxX: 0, minY: H, maxY: 0 };
    stack.push(start);
    label[start] = cid;
    while (stack.length) {
      const p = stack.pop()!;
      c.pixels.push(p);
      const x = p % W;
      const y = (p / W) | 0;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const np = ny * W + nx;
          if (on(np) && label[np] === -1) {
            label[np] = cid;
            stack.push(np);
          }
        }
      }
    }
    comps.push(c);
  }

  if (comps.length <= 1) return { removed: 0, noiseComps: [] };

  // 메인 = 최대 컴포넌트. 노이즈 = (메인 아님) + (작음 < MIN_PX).
  let mainIdx = 0;
  for (let i = 1; i < comps.length; i++) {
    if (comps[i]!.pixels.length > comps[mainIdx]!.pixels.length) mainIdx = i;
  }
  const noiseComps: number[] = [];
  let removed = 0;
  for (let i = 0; i < comps.length; i++) {
    if (i === mainIdx) continue;
    const sz = comps[i]!.pixels.length;
    if (sz < MIN_COMPONENT_PX) {
      noiseComps.push(sz);
      if (APPLY) {
        for (const p of comps[i]!.pixels) data[p * 4 + 3] = 0;
        removed += sz;
      }
    }
  }

  if (APPLY && removed > 0) {
    await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path);
  }
  return { removed, noiseComps };
}

async function main() {
  let totalNoise = 0;
  let filesWithNoise = 0;

  for (const slot of SLOTS) {
    const dir = join(SPRITES_DIR, slot);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join(dir, f);
      const { removed, noiseComps } = await processFile(path);
      if (noiseComps.length > 0) {
        filesWithNoise++;
        totalNoise += noiseComps.reduce((a, b) => a + b, 0);
        console.log(
          `${APPLY ? '제거' : '발견'} ${slot}/${f}: 노이즈 덩어리 ${noiseComps.length}개 (px ${noiseComps.join(',')})${APPLY ? ` → ${removed}px 투명화` : ''}`,
        );
      }
    }
  }
  console.log(
    `\n[${APPLY ? 'APPLY' : '분석'}] 노이즈 있는 파일 ${filesWithNoise}개 · 총 노이즈 ${totalNoise}px (MIN_COMPONENT_PX=${MIN_COMPONENT_PX})`,
  );
  if (!APPLY) console.log('적용하려면 --apply, 이후 build-sprite-atlas.ts 재실행.');
}

main();
