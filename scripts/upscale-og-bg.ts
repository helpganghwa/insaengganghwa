// OG 배경 이미지 8장을 1200×630으로 cover-crop 업스케일.
// 원본 200×120(5:3)이 1200×630(40:21)에 맞지 않아 OG 카드에서 한쪽으로 치우쳐
// 보이는 문제 해결. sharp `fit:'cover'`로 가운데 영역만 잘라 정확한 비율로 맞춤.
// 실행: bun run scripts/upscale-og-bg.ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = join(process.cwd(), 'public', 'og');
const files = readdirSync(DIR).filter((f) => /^og-\d+\.png$/.test(f));

if (files.length === 0) {
  console.error('og-*.png 파일이 없습니다 →', DIR);
  process.exit(1);
}

for (const f of files) {
  const src = join(DIR, f);
  if (!existsSync(src)) continue;
  // 1200×630 cover — 작은 원본을 nearest neighbor로 픽셀 보존 업스케일.
  const out = await sharp(src, { failOn: 'none' })
    .resize(1200, 630, { fit: 'cover', position: 'center', kernel: 'nearest' })
    .png()
    .toBuffer();
  await sharp(out).toFile(src);
  console.log(`  ✓ ${f} → 1200×630 (${out.length}B)`);
}
console.log(`[og-bg] upscaled ${files.length} files.`);
