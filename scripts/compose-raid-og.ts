/**
 * 레이드 공유 OG 이미지 생성 — 보스 배경 + 몬스터 sprite를 1200×630 PNG로
 * 미리 합성. 결과는 public/og/raid/<boss>.png 에 저장 → 카카오 imageUrl에서
 * 정적 자산으로 직접 사용(서버리스 동적 생성 불필요).
 *
 * 실행: bun run scripts/compose-raid-og.ts
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BOSSES = [
  'slime_king',
  'orc_chief',
  'stone_golem',
  'dragon_west',
  'fallen_angel',
] as const;

const OUT_W = 1200;
const OUT_H = 630;
const SPRITE_SIZE = 630; // 화면 height 가득(2026-06-01 사용자 결정 — 420 → 1.5배).

const ROOT = process.cwd();
const SPRITE_DIR = path.join(ROOT, 'public/sprites/boss');
const BG_DIR = path.join(ROOT, 'public/sprites/boss/bg');
const OUT_DIR = path.join(ROOT, 'public/og/raid');

async function compose(boss: string) {
  const bgPath = path.join(BG_DIR, `${boss}.png`);
  const spritePath = path.join(SPRITE_DIR, `${boss}.png`);

  // 배경 — 1200×630에 cover. 픽셀아트 보존을 위해 nearest neighbor.
  const bgBuf = await sharp(bgPath)
    .resize(OUT_W, OUT_H, { fit: 'cover', position: 'center', kernel: 'nearest' })
    .png()
    .toBuffer();

  // sprite — SPRITE_SIZE 정사각형, nearest neighbor 확대.
  const spriteBuf = await sharp(spritePath)
    .resize(SPRITE_SIZE, SPRITE_SIZE, { fit: 'contain', kernel: 'nearest' })
    .png()
    .toBuffer();

  const outPath = path.join(OUT_DIR, `${boss}.png`);
  await sharp(bgBuf)
    .composite([
      {
        input: spriteBuf,
        top: Math.max(0, Math.round((OUT_H - SPRITE_SIZE) / 2)),
        left: Math.round((OUT_W - SPRITE_SIZE) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return outPath;
}

await mkdir(OUT_DIR, { recursive: true });
for (const boss of BOSSES) {
  const out = await compose(boss);
  console.log(`✓ ${boss} → ${path.relative(ROOT, out)}`);
}
console.log(`완료 — ${BOSSES.length}개 OG 이미지 생성 (${OUT_W}×${OUT_H}).`);
