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
      'a bold detailed kite shield emblem at the center of the ticket — the shield is a pointed teardrop ' +
      'kite shape with a vertical band and two diagonal cross-stripes across its face, metal rivets ' +
      'around the rim, clearly looks like a medieval knight shield (NOT just a plain circle, NOT a coin), ' +
      'cool steel-blue and white ticket colors, soft silver glow, ' +
      'clearly recognizable as a paper TICKET shape (not a scroll, not a parchment), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', scroll, rolled parchment, banner, plain circle, coin, disc, ring, shield by itself',
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
      'top ticket is golden with a clear crossed-swords X emblem (two swords crossing diagonally), ' +
      'middle ticket is blue with a clear kite shield emblem (pointed teardrop shape with band+cross stripes, NOT a circle), ' +
      'bottom ticket is green with a clear gemstone ring emblem (golden ring with a cyan gem on top), ' +
      'each ticket has clear zigzag perforated tear edges, fanned at slight angles overlapping, ' +
      'red ribbon tie at the bottom corner, soft warm glow, ' +
      'absolutely no box, no chest, no container — just three fanned TICKETS, ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', chest, box, container, package, gift box, wrapped present, scroll, parchment, single object, plain circles, coins',
  },
  {
    name: 'tile-chest-lg',
    width: 64,
    height: 64,
    noBg: true,
    prompt:
      'a single large fan of six horizontal carnival paper tickets fanned out wide like a poker hand held up, ' +
      'six tickets spread in a wider fan arc — two golden weapon tickets (crossed swords emblem), ' +
      'two blue kite shield tickets (kite shield emblem), two green ring tickets (gem ring emblem), ' +
      'each ticket has clear zigzag perforated edges on the short sides, tickets overlap slightly at the fan center, ' +
      'soft warm golden glow halo, small sparkle particles around the fan, ' +
      'clearly visible as SIX FANNED TICKETS (NOT a gift box, NOT a wrapped present, NOT a chest, NOT a stripe block, NOT a scroll), ' +
      STYLE_OBJ,
    negative:
      NEG_OBJ +
      ', gift box, wrapped present, ribbon bow, chest, box, container, scroll, parchment, ' +
      'single block, single object, book, journal, layered stripes, color bands, indistinct mass',
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
      'three large bright cyan-blue cut diamond gems with classic faceted brilliant-cut rhombus shape, ' +
      'arranged in a triangle pyramid composition — two diamonds at the bottom side by side, one big diamond on top center, ' +
      'each diamond is clearly individually visible with sharp polished facet lines, top triangular crown, bottom pointed tip, ' +
      'white sparkle highlights on top edges of each diamond, soft cyan glow halo, ' +
      'three CLEAN DISTINCT CUT DIAMONDS arranged like a small trophy display (NOT a vague pile, NOT raw crystals, NOT a chest), ' +
      STYLE_OBJ,
    negative: NEG_OBJ + ', single gem, crystal cluster, raw crystal, vague mass, chest, ticket, scroll, blob',
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
      'calm subtle dark wood plank board background for a UI grid overlay, ' +
      'uniform deep brown stained wood texture with very faint subtle wood grain lines, ' +
      'extremely simple thin golden hairline border framing the outer edge only, no corner ornaments, ' +
      'completely flat uniform tone across the entire image (no central focus, no patterns, no particles), ' +
      'low contrast quiet backdrop designed so foreground UI cells and text stay highly readable, ' +
      'soft ambient warm low brightness, ' +
      'NO filigree, NO sparkles, NO stars, NO ornate scrollwork, NO bright highlights, NO decorative motifs, ' +
      STYLE_BG,
    negative:
      NEG_BG +
      ', filigree, scrollwork, ornaments, sparkles, stars, particles, glitter, ' +
      'bright highlights, vibrant colors, busy pattern, central focus object, ' +
      'grid lines, calendar cells, squares, individual stamps',
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
      'horizontal calm flat amber wooden button background banner, ' +
      'uniform warm dark amber wood tone across the entire strip, very faint horizontal grain only, ' +
      'extremely simple thin golden hairline border framing the outer rectangle edges, ' +
      'subtle soft inner shadow at top and bottom edges for slight 3D depth, ' +
      'completely uniform horizontal tone with NO central focus, NO medallion, NO gem inlay, NO filigree, ' +
      'low contrast quiet backdrop designed so white/light button label text overlay stays highly readable, ' +
      'looks like a calm clean tappable button base ready for text overlay, ' +
      STYLE_BG,
    negative:
      NEG_BG +
      ', filigree, scrollwork, ornaments, medallion, wax seal, gem inlay, sparkles, ' +
      'bright highlights, central focus object, decorative motifs, text label, words, characters',
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
      'calm flat clean cream parchment panel background, ' +
      'uniform warm cream beige paper tone across the entire panel with very subtle paper grain texture, ' +
      'extremely simple thin golden hairline border framing the outer rectangle edges only, no corner ornaments, ' +
      'no wax seal, no filigree, no central focus object, no patterns, no particles, ' +
      'completely uniform tone designed so foreground dark text and an inset button overlay stay highly readable, ' +
      'low contrast quiet backdrop with very gentle soft warm ambient light, ' +
      STYLE_BG,
    negative:
      NEG_BG +
      ', filigree, scrollwork, ornaments, corner ornaments, wax seal, sparkles, ' +
      'central focus object, decorative motifs, text label, words, characters, busy pattern',
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
