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

  // 보수적: 외부 영역과 직접 인접(8방향 1px)한 흰색 픽셀(rgb >= 210)만 제거.
  // outline 본체·내부 픽셀은 절대 건드리지 않음.
  let cleaned = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (buf[idx * 4 + 3] === 0) continue;
      // 외부 영역과 직접 인접인지(8방향 1px)
      let nextToOutside = false;
      for (let dy = -1; dy <= 1 && !nextToOutside; dy++) {
        for (let dx = -1; dx <= 1 && !nextToOutside; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          if (outside[ny * W + nx]) nextToOutside = true;
        }
      }
      if (!nextToOutside) continue;
      // 흰색에 가까운 픽셀만 제거 (210 이상 — 옷·머리·피부의 자연 밝은 색은 보존).
      const r = buf[idx * 4]!;
      const g = buf[idx * 4 + 1]!;
      const b = buf[idx * 4 + 2]!;
      if (r >= 210 && g >= 210 && b >= 210) {
        buf[idx * 4 + 3] = 0;
        cleaned++;
      }
    }
  }

  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(path);
  console.log(`✓ ${f} — ${cleaned} px cleaned (outline-adjacent white)`);
}
console.log(`\n${files.length} files processed`);
