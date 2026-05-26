// /checkin 페이지 자산 일괄 생성 (Pixellab pixflux).
//   - 보상 타일 8종 (64×64, no_background: true) — 28 캘린더 칸에 매핑
//   - 그리드 나무판뎍 배경 1장 (384×288, no_background: false) — 4행 그리드 뒤
//   - 수령 버튼 양피지 배경 1장 (384×64, no_background: false)
//
// 실행: bun run scripts/gen-checkin-assets.ts [tile-name]
//   인자 없으면 전체 / 인자 있으면 단일 자산만 (예: `weapon`, `grid`)
// 출력: public/sprites/checkin/*.png
// 비용: pixflux ~$0.05/장 × 10 ≈ $0.5
//
// 메모리: Pixellab REST 패턴(낮은 동시성·429 백오프) 준수.

import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}

const OUT = join(process.cwd(), 'public', 'sprites', 'checkin');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

type Spec = {
  name: string;
  width: number;
  height: number;
  noBg: boolean;
  prompt: string;
  negative?: string;
};

// 공통 스타일 토큰
const STYLE_OBJ =
  'centered single object, fantasy RPG pixel art, ' +
  'crisp pixel art with detailed individual pixels, ' +
  'soft gradient cel shading, ' +
  'palette: warm cream parchment, deep brown wood, amber gold light, soft red wax accents, ' +
  'no text, no watermark, no border';

const STYLE_BG =
  'edge-to-edge fully filled solid background, no transparent areas, no margins, ' +
  'crisp pixel art, soft warm lamp light, ' +
  'palette: warm cream parchment, deep brown wood, amber gold light, soft red wax accents, ' +
  'no characters, no faces, no text, no watermark';

const NEG_OBJ =
  'characters, people, faces, hands, blurry, photo realistic, 3D render, modern UI elements, ' +
  'text, numbers, letters, watermark, frame border, jpeg artifacts, multiple objects';
const NEG_BG = 'characters, people, faces, hands, text, watermark, blurry, photo realistic, 3D';

const SPECS: Spec[] = [
  // ── 보급권 스크롤 3종 ─────────────────────────────────────────────────
  {
    name: 'tile-weapon',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'small rolled-up parchment ticket scroll with a tiny embossed sword icon on the seal, ' +
      'wax seal red, leather ribbon tie, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  {
    name: 'tile-armor',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'small rolled-up parchment ticket scroll with a tiny embossed round shield icon on the seal, ' +
      'wax seal red, leather ribbon tie, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  {
    name: 'tile-accessory',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a rolled-up parchment ticket scroll laid horizontally with a shiny golden ring resting on top of the scroll, ' +
      'the gold ring has a sparkling cyan gemstone, leather ribbon tie around the scroll, soft glow, ' +
      'clearly shows both parchment scroll AND a jewelry ring together, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', bucket, barrel, container, pipe, sword, shield',
  },
  // ── 다이아 더미 3종 ────────────────────────────────────────────────────
  {
    name: 'tile-gem-sm',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a small pile of bright cyan magical crystal gems stacked on the ground, ' +
      'about three to five gems visible, soft glow halo, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  {
    name: 'tile-gem-md',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a medium open small wooden chest overflowing with bright cyan magical crystal gems, ' +
      'rich glow, several gems spilling out, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  {
    name: 'tile-gem-grand',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a large golden chest brimming with cyan magical crystal gems and gold coins, ' +
      'ornate gold trim, intense radiant halo, sparkle particles, royal grand treasure, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  // ── 마일스톤 보급 세트 2종 ─────────────────────────────────────────────
  {
    name: 'tile-chest-sm',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a small wooden treasure chest open showing three rolled parchment ticket scrolls inside ' +
      '(weapon scroll, shield scroll, ring scroll bundled together), iron bands, soft glow, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  {
    name: 'tile-chest-lg',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a large ornate wooden treasure chest open overflowing with many rolled parchment ticket scrolls ' +
      '(weapon, shield, ring scrolls stacked high), gilded iron bands, golden glow, rich amber sparkle, ' +
      'item icon for inventory grid, ' +
      STYLE_OBJ,
    negative: NEG_OBJ,
  },
  // ── 배경 2종 ───────────────────────────────────────────────────────────
  {
    name: 'grid-bg',
    width: 384,
    height: 288,
    noBg: false,
    prompt:
      'flat dark wooden plaque texture for an attendance calendar background, ' +
      'subtle wood grain, faint carved cell-grid impressions arranged in rows and columns, ' +
      'metal corner rivets, soft amber lamp glow on edges, ' +
      'completely uniform vertical tone (no central focus, no objects), ' +
      'looks like a calendar wall board ready for stamps, ' +
      STYLE_BG,
    negative: NEG_BG,
  },
  {
    name: 'button-bg',
    width: 384,
    height: 64,
    noBg: false,
    prompt:
      'horizontal aged amber parchment banner texture for a fantasy RPG button background, ' +
      'subtle wax seal smudges, soft warm gradient, slight worn paper edges, ' +
      'completely uniform horizontal tone (no central focus, no objects), ' +
      STYLE_BG,
    negative: NEG_BG,
  },
];

async function gen(spec: Spec): Promise<'ok' | 'fail'> {
  const file = join(OUT, `${spec.name}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: spec.prompt,
          negative_description: spec.negative,
          image_size: { width: spec.width, height: spec.height },
          text_guidance_scale: 11,
          no_background: spec.noBg,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${spec.name} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${spec.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return 'fail';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${spec.name} bad PNG`);
        return 'fail';
      }
      if (existsSync(file)) {
        writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      }
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${spec.name} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

const only = process.argv[2];
const targets = only ? SPECS.filter((s) => s.name.includes(only)) : SPECS;
if (targets.length === 0) {
  console.error(`매칭 자산 없음: ${only}`);
  process.exit(1);
}
console.log(`[checkin assets] 생성 ${targets.length}건`);
let okCount = 0;
for (const s of targets) {
  const r = await gen(s);
  if (r === 'ok') okCount++;
  // 동시성 낮게 — 호출 사이 800ms 휴식(429 회피)
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[checkin assets] OK ${okCount}/${targets.length}`);
process.exit(okCount === targets.length ? 0 : 1);
