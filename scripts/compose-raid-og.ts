/**
 * 레이드 공유 OG 이미지 생성 — 보스 그라데이션 배경(상세 카드와 동일) + 보스
 * 배경 그림(opacity 0.30) + 좌우 vignette + 보스 sprite 가운데. 1200×630 PNG로
 * 합성해 public/og/raid/<boss>.png 에 저장.
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
type Boss = (typeof BOSSES)[number];

const OUT_W = 1200;
const OUT_H = 630;
const SPRITE_SIZE = 630;

// RaidSlots BOSS_BG_CLASS 와 동일 색(Tailwind 정확값) — 상세 카드와 같은 톤.
const BG_GRADIENTS: Record<Boss, [string, string, string]> = {
  slime_king:   ['#064E3B', '#166534', '#022C22'], // emerald-900 / green-800 / emerald-950
  orc_chief:    ['#450A0A', '#292524', '#09090B'], // red-950 / stone-800 / zinc-950
  stone_golem:  ['#57534E', '#292524', '#1C1917'], // stone-600 / stone-800 / zinc-900
  dragon_west:  ['#7C2D12', '#7F1D1D', '#09090B'], // orange-900 / red-900 / zinc-950
  fallen_angel: ['#2E1065', '#581C87', '#09090B'], // violet-950 / purple-900 / zinc-950
};

const ROOT = process.cwd();
const SPRITE_DIR = path.join(ROOT, 'public/sprites/boss');
const BG_DIR = path.join(ROOT, 'public/sprites/boss/bg');
const OUT_DIR = path.join(ROOT, 'public/og/raid');

function gradientSvg(from: string, via: string, to: string): string {
  return `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="50%" stop-color="${via}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="${OUT_W}" height="${OUT_H}" fill="url(#g)"/>
  </svg>`;
}

function vignetteSvg(): string {
  // 양옆 검정 0.55 → 가운데 검정 0.20 (상세 카드 overlay와 동일 패턴, 살짝 완화).
  return `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="v" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.55)"/>
        <stop offset="50%" stop-color="rgba(0,0,0,0.20)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
      </linearGradient>
    </defs>
    <rect width="${OUT_W}" height="${OUT_H}" fill="url(#v)"/>
  </svg>`;
}

async function compose(boss: Boss) {
  const [from, via, to] = BG_GRADIENTS[boss];
  const bgPath = path.join(BG_DIR, `${boss}.png`);
  const spritePath = path.join(SPRITE_DIR, `${boss}.png`);

  // 1) 그라데이션 base.
  const baseBuf = await sharp(Buffer.from(gradientSvg(from, via, to))).png().toBuffer();

  // 2) 보스 배경 그림 — cover + alpha 0.30 (분위기만).
  const bgImgBuf = await sharp(bgPath)
    .resize(OUT_W, OUT_H, { fit: 'cover', position: 'center', kernel: 'nearest' })
    .ensureAlpha(0.30)
    .png()
    .toBuffer();

  // 3) 양옆 vignette.
  const vignetteBuf = await sharp(Buffer.from(vignetteSvg())).png().toBuffer();

  // 4) 보스 sprite 가운데.
  const spriteBuf = await sharp(spritePath)
    .resize(SPRITE_SIZE, SPRITE_SIZE, { fit: 'contain', kernel: 'nearest' })
    .png()
    .toBuffer();

  const outPath = path.join(OUT_DIR, `${boss}.png`);
  await sharp(baseBuf)
    .composite([
      { input: bgImgBuf, top: 0, left: 0 },
      { input: vignetteBuf, top: 0, left: 0 },
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
