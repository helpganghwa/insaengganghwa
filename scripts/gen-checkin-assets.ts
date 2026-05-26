// /checkin 페이지 자산 일괄 생성 (Pixellab pixflux).
//   - 보상 타일 8종 (64×64, no_background: true) — 28 캘린더 칸에 매핑
//   - 그리드 화려한 캘린더 보드 배경 1장 (384×288) — 4행 그리드 뒤
//   - 수령 버튼 보석/금장 strip 1장 (384×64)
//   - 오늘 카드 ornate 패널 1장 (384×128)
//
// 실행: bun run scripts/gen-checkin-assets.ts [tile-name]
//   인자 없으면 전체 / 인자 있으면 매칭 자산만 (예: `weapon`, `grid`, `card`)
// 출력: public/sprites/checkin/*.png
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
  'centered single object, fantasy RPG pixel art item icon, ' +
  'crisp pixel art with detailed individual pixels, ' +
  'soft cel shading with strong highlights, ' +
  'no text, no numbers, no letters, no watermark, no border';

const STYLE_BG =
  'edge-to-edge fully filled background, no transparent areas, no margins, ' +
  'crisp ornate pixel art, soft magical glow, ' +
  'no characters, no faces, no text, no numbers, no watermark';

const NEG_OBJ =
  'characters, people, faces, hands, blurry, photo realistic, 3D render, modern UI elements, ' +
  'text, numbers, letters, watermark, frame border, jpeg artifacts, multiple separate objects';
const NEG_BG = 'characters, people, faces, hands, text, numbers, letters, watermark, blurry, photo realistic, 3D';

const SPECS: Spec[] = [
  // ─────────────────────────────────────────────────────────────────────
  // 보급권 = 클래식 티켓/쿠폰 모양 (양피지·스크롤 X)
  //  - 직사각형 가로 티켓, 좌측 절취선(perforation), 우측 중앙에 종류 아이콘
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'tile-weapon',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a single golden carnival admit-one paper ticket coupon shaped like a horizontal rectangle ' +
      'with a clear zigzag perforated tear edge on the left side, ' +
      'a bold embossed crossed-swords weapon emblem icon at the center of the ticket, ' +
      'rich gold and crimson ticket colors, soft golden glow, ' +
      'clearly recognizable as a paper TICKET shape (not a scroll, not a parchment), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', scroll, rolled parchment, banner, sword by itself',
  },
  {
    name: 'tile-armor',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a single silver-blue carnival admit-one paper ticket coupon shaped like a horizontal rectangle ' +
      'with a clear zigzag perforated tear edge on the left side, ' +
      'a bold embossed round kite shield emblem icon at the center of the ticket, ' +
      'cool steel-blue and white ticket colors, soft silver glow, ' +
      'clearly recognizable as a paper TICKET shape (not a scroll, not a parchment), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', scroll, rolled parchment, banner, shield by itself',
  },
  {
    name: 'tile-accessory',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a single emerald-green carnival admit-one paper ticket coupon shaped like a horizontal rectangle ' +
      'with a clear zigzag perforated tear edge on the left side, ' +
      'a bold embossed gemstone ring emblem icon at the center of the ticket, ' +
      'rich emerald-green and gold ticket colors, soft green glow, ' +
      'clearly recognizable as a paper TICKET shape (not a scroll, not a parchment), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', scroll, rolled parchment, banner, ring by itself, bucket',
  },
  // ─────────────────────────────────────────────────────────────────────
  // 마일스톤 보급권 묶음 (D7=10ea, D21=20ea) — 티켓 묶음 / 티켓 묶음 여러개
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'tile-chest-sm',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'three flat horizontal carnival paper tickets fanned out like a poker hand, ' +
      'top ticket is golden with a tiny crossed-swords emblem, ' +
      'middle ticket is blue with a tiny shield emblem, ' +
      'bottom ticket is green with a tiny ring emblem, ' +
      'each ticket has clear zigzag perforated tear edges, fanned at slight angles overlapping, ' +
      'red ribbon tie at the bottom corner, soft warm glow, ' +
      'absolutely no box, no chest, no container — just three fanned TICKETS, ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', chest, box, container, package, gift box, wrapped present, scroll, parchment, single object',
  },
  {
    name: 'tile-chest-lg',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a large tall stack of many carnival paper tickets tied in several ribbons, ' +
      'multiple bundles of weapon, shield, ring tickets stacked high, ' +
      'gold ribbon binding, sparkle particles around the stack, intense golden glow, ' +
      'clearly visible as a HUGE PILE of TICKETS (not a chest, not parchment), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', chest, box, container, scroll, parchment',
  },
  // ─────────────────────────────────────────────────────────────────────
  // 다이아 — 클래식 cut diamond gem 형태(♦), 가공된 보석. gem pile 금지
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'tile-gem-sm',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a single bright cyan-blue cut diamond gem with classic faceted brilliant-cut shape (rhombus, ♦), ' +
      'sharp polished facets reflecting light, white sparkle highlights on top edges, ' +
      'gemstone shape clearly diamond-cut (not round, not crystal cluster), ' +
      'soft cyan glow halo, ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', crystal cluster, raw crystal, round gem, multiple gems, chest, ticket, scroll',
  },
  {
    name: 'tile-gem-md',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a small bundle pile of three to five bright cyan-blue cut diamond gems with classic faceted brilliant-cut shape, ' +
      'diamonds stacked together forming a small cluster, polished facets reflecting light, ' +
      'gemstones clearly diamond-cut (rhombus/brilliant shape), ' +
      'rich cyan glow halo, ' +
      'visible as a CLUSTER OF CUT DIAMONDS (not a chest, not a scroll, not raw crystals), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', single gem, crystal cluster, raw crystal, chest, ticket, scroll',
  },
  {
    name: 'tile-gem-grand',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'an open ornate golden treasure box overflowing with many bright cyan-blue cut diamond gems, ' +
      'gilded gold trim and clasp on the box, diamonds spilling over the edges, brilliant facets reflecting light, ' +
      'intense radiant golden halo, sparkle particles around the box, ' +
      'visible as a TREASURE BOX FULL OF DIAMONDS (premium grand reward), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', ticket, scroll, single gem, raw crystal cluster',
  },
  // ─────────────────────────────────────────────────────────────────────
  // 그리드 배경 — 화려한 판타지 캘린더 보드
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'grid-bg',
    width: 384,
    height: 288,
    noBg: false,
    prompt:
      'ornate fantasy RPG attendance calendar board background, ' +
      'rich dark navy-purple velvet cloth backdrop with subtle starfield pattern, ' +
      'golden filigree decorative borders on all four edges, golden corner ornaments, ' +
      'subtle magical sparkle particles scattered throughout, soft ambient amber-gold glow, ' +
      'gilded festive medieval guild hall feel, no grid cells (cells will be overlaid by UI), ' +
      'uniform tone across the whole image so UI cells overlay cleanly, ' +
      STYLE_BG,
    negative: NEG_BG + ', grid lines, calendar cells, squares, individual stamps',
  },
  // ─────────────────────────────────────────────────────────────────────
  // 수령 버튼 — 보석·금장 strip
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'button-bg',
    width: 384,
    height: 64,
    noBg: false,
    prompt:
      'horizontal ornate fantasy RPG action button background banner, ' +
      'polished gold metal strip with embossed scroll filigree pattern, ' +
      'central wax seal medallion stamp accent, ' +
      'small cyan gem inlays on both short ends, soft amber inner glow, ' +
      'rich gold gleam highlights, completely uniform horizontal tone (no central focus object), ' +
      'looks like a premium golden press-button strip ready for text overlay, ' +
      STYLE_BG,
    negative: NEG_BG + ', text label, words, characters',
  },
  // ─────────────────────────────────────────────────────────────────────
  // 오늘 카드 — ornate 패널 (오늘 보상 미리보기 + 버튼 wrapper)
  // ─────────────────────────────────────────────────────────────────────
  {
    name: 'card-bg',
    width: 384,
    height: 128,
    noBg: false,
    prompt:
      'ornate fantasy RPG UI panel background banner, ' +
      'aged warm parchment with gilded gold filigree corner decorations, ' +
      'subtle red wax seal smudges, soft warm amber inner glow, ' +
      'thin golden inner border line, fine pixel-art floral motif corners, ' +
      'completely uniform horizontal tone with no central object (panel ready for text and button overlay), ' +
      STYLE_BG,
    negative: NEG_BG + ', text label, words, characters, central object',
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
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[checkin assets] OK ${okCount}/${targets.length}`);
process.exit(okCount === targets.length ? 0 : 1);
