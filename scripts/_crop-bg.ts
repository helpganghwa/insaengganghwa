// 랭킹 배경 위아래 어두운 부분 크롭(일회성) — 400x224 → 400x174 (위30·아래20 제거).
// 실행: bun run scripts/_crop-bg.ts
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const TOP = 30;
const HEIGHT = 174;

async function main() {
  for (const f of ['hof', 'forge', 'arena']) {
    const src = `public/sprites/${f}-bg.png`;
    const buf = await sharp(src)
      .extract({ left: 0, top: TOP, width: 400, height: HEIGHT })
      .png()
      .toBuffer();
    writeFileSync(src, buf);
    console.log(`${f}: cropped → 400x${HEIGHT}`);
  }
}

main();
