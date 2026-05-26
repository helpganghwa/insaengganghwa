// 캐릭터 외부 영역 floodfill — 4 corner에서 시작해 alpha 변동 없는 영역 확장.
// 외부로 판정된 영역의 alpha=255 픽셀(=고립된 흰점)을 모두 0으로 변환.
// 캐릭터 본체 내부 흰자위/하이라이트는 외부 영역과 분리되어 안전 보존.
//
// 실행: bun run scripts/_floodfill-char-bg.ts

import sharp from 'sharp';
import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'fx');
const files = readdirSync(DIR)
  .filter((f) => f.startsWith('char-') && f.endsWith('.png'))
  .filter((f) => !f.includes('.bak.'));

for (const f of files) {
  const path = join(DIR, f);
  const bakPath = path.replace(/\.png$/, '.flood.bak.png');
  if (!existsSync(bakPath)) writeFileSync(bakPath, readFileSync(path));

  const img = sharp(path);
  const meta = await img.metadata();
  const { width: W, height: H } = meta;
  if (!W || !H) continue;
  const buf = await img.raw().toBuffer();

  // 외부 영역 마킹 — 4 corner 픽셀 중 alpha=0인 곳에서 BFS.
  // 외부 = alpha=0 픽셀들로 연결된 영역. floodfill 결과를 outside[] 비트맵에 저장.
  const outside = new Uint8Array(W * H);
  const queue: number[] = [];
  function push(x: number, y: number) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = y * W + x;
    if (outside[idx]) return;
    if (buf[idx * 4 + 3] !== 0) return; // 투명 픽셀만 외부로 전파
    outside[idx] = 1;
    queue.push(idx);
  }
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % W;
    const y = Math.floor(idx / W);
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  // 1차 — 외부 영역과 4px 이내 인접 + 밝은 픽셀(rgb >= 180) 제거.
  // 2차 — 검은 outline 픽셀(rgb 모두 <= 80) 옆 8방향에 있는 흰색(rgb >= 200) 픽셀도 제거
  //       (outline의 anti-alias halo).
  let cleaned = 0;
  const EDGE_RADIUS = 4;
  const EDGE_BRIGHT = 180;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (buf[idx * 4 + 3] === 0) continue;
      let nextToOutside = false;
      for (let dy = -EDGE_RADIUS; dy <= EDGE_RADIUS && !nextToOutside; dy++) {
        for (let dx = -EDGE_RADIUS; dx <= EDGE_RADIUS && !nextToOutside; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          if (outside[ny * W + nx]) nextToOutside = true;
        }
      }
      if (!nextToOutside) continue;
      const r = buf[idx * 4]!;
      const g = buf[idx * 4 + 1]!;
      const b = buf[idx * 4 + 2]!;
      if (r >= EDGE_BRIGHT && g >= EDGE_BRIGHT && b >= EDGE_BRIGHT) {
        buf[idx * 4 + 3] = 0;
        cleaned++;
      }
    }
  }
  // 2차 — outline halo: 검은 픽셀 옆 흰 픽셀.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (buf[idx * 4 + 3] !== 255) continue;
      const r = buf[idx * 4]!;
      const g = buf[idx * 4 + 1]!;
      const b = buf[idx * 4 + 2]!;
      if (r < 200 || g < 200 || b < 200) continue; // 흰색만
      // 8방향 이웃에 검은 outline 픽셀(rgb 모두 <= 80) 있나
      let nextToOutline = false;
      for (let dy = -1; dy <= 1 && !nextToOutline; dy++) {
        for (let dx = -1; dx <= 1 && !nextToOutline; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = (ny * W + nx) * 4;
          if (buf[ni + 3] !== 255) continue;
          if (buf[ni]! <= 80 && buf[ni + 1]! <= 80 && buf[ni + 2]! <= 80) {
            nextToOutline = true;
          }
        }
      }
      if (nextToOutline) {
        // 외부 영역과 인접하면 제거(outline 외측 halo만). 내부 흰자위는 보존.
        let nearOutside = false;
        for (let dy = -3; dy <= 3 && !nearOutside; dy++) {
          for (let dx = -3; dx <= 3 && !nearOutside; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            if (outside[ny * W + nx]) nearOutside = true;
          }
        }
        if (nearOutside) {
          buf[idx * 4 + 3] = 0;
          cleaned++;
        }
      }
    }
  }

  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(path);
  console.log(`✓ ${f} — ${cleaned} px cleaned (outline-adjacent white)`);
}
console.log(`\n${files.length} files processed`);
