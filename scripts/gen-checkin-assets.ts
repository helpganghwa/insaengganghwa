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
import sharp from 'sharp';

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
  // ↓ 3종 모두 동일 prompt template, color+emblem 키워드만 변경 → 사이즈/모양 일관성 최대화
  ...(
    [
      {
        name: 'tile-weapon',
        color: 'rich warm gold yellow with crimson red trim',
        glow: 'golden',
        emblem:
          'a bold black crossed-swords X emblem (two crossed pixel-art swords forming an X) at the dead center of the ticket',
        negExtra: 'sword by itself, single sword',
      },
      {
        name: 'tile-armor',
        color: 'cool steel blue with white trim',
        glow: 'silver-blue',
        emblem:
          'a bold black detailed kite shield emblem at the dead center of the ticket — pointed teardrop kite shape with vertical band and diagonal cross stripes, metal rivets around rim, looks like a medieval knight shield (NOT a plain circle, NOT a coin)',
        negExtra: 'plain circle, coin, disc, ring, shield by itself',
      },
      {
        name: 'tile-accessory',
        color: 'rich emerald green with gold trim',
        glow: 'emerald-green',
        emblem:
          'a bold black gemstone ring emblem at the dead center of the ticket — a circular gold ring viewed from front with a sparkling cut gem mounted on top, clearly a piece of jewelry (NOT a plain circle, NOT a coin)',
        negExtra: 'ring by itself, plain circle, coin, disc, bucket',
      },
    ] as const
  ).map(
    (t): Spec => ({
      name: t.name,
      width: 64,
      height: 64,
      noBg: true,
      // ── 공통 템플릿: 형태/비율/원근 모두 동일 ──
      prompt:
        'a single classic horizontal carnival admit-one paper ticket coupon, ' +
        'strictly horizontal rectangle aspect ratio about 2 to 1 (wider than tall), ' +
        'flat 2D front-facing view, perfectly centered in the canvas, no tilt no rotation, ' +
        'clear zigzag perforated tear edges on BOTH left and right short sides, ' +
        `${t.emblem}, ` +
        `ticket body color is ${t.color}, soft ${t.glow} glow halo, ` +
        'classic ticket shape with rounded inner border line, identical proportions to a real movie ticket, ' +
        'NOT a scroll, NOT a parchment, NOT a banner, NOT a card, NOT a coin — ONLY a horizontal paper TICKET, ' +
        STYLE_OBJ,
      negative: NEG_OBJ + ', ' + t.negExtra + ', scroll, rolled parchment, banner, vertical orientation, tilted',
    }),
  ),
  // tile-chest-sm / tile-chest-lg — Pixellab 생성 X. sharp로 단일 티켓 PNG를
  // 회전·합성해 만든다(아래 composeFanTiles 함수). 매번 모양·사이즈 100% 동일 보장.
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

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 fan/stack 합성 — 단일 티켓 PNG를 회전·축소·합성
// 사용자 피드백(2026-05-26): 단일·fan·stack 티켓 모양 일관성 보장 위해 같은 PNG 사용
// ─────────────────────────────────────────────────────────────────────────────

const SINGLE_TICKETS = ['tile-weapon', 'tile-armor', 'tile-accessory'] as const;

type FanLayer = {
  /** 단일 티켓 파일명(확장자 제외) */
  from: (typeof SINGLE_TICKETS)[number];
  /** 회전(도). 양수 = 시계방향. */
  rotate: number;
  /** 캔버스 width 대비 크기 비율(0~1). */
  scale: number;
  /** 캔버스 중심에서 가로 offset (px). 음수=왼쪽. 기본 0. */
  dx?: number;
  /** 캔버스 중심에서 세로 offset (px). 양수=아래. 기본 0. */
  dy?: number;
};

const TILE = 64;

async function composeFan(layers: FanLayer[], outName: string): Promise<void> {
  const composites = await Promise.all(
    layers.map(async (L) => {
      const target = Math.round(TILE * L.scale);
      // 1) 단일 티켓 → 목표 정사각으로 contain 리사이즈 (티켓은 가로 직사각이라 실제 높이는 낮음)
      // 2) 투명 배경 보존하며 회전 — bbox는 회전 후 sharp가 자동 확장
      const buf = await sharp(join(OUT, `${L.from}.png`))
        .resize(target, target, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .rotate(L.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer({ resolveWithObject: true });
      const { width: w, height: h } = buf.info;
      // 회전된 레이어의 중심을 캔버스 중심 + (dx, dy)에 배치
      const cx = TILE / 2 + (L.dx ?? 0);
      const cy = TILE / 2 + (L.dy ?? 0);
      const left = Math.round(cx - w / 2);
      const top = Math.round(cy - h / 2);
      return { input: buf.data, top, left };
    }),
  );
  const file = join(OUT, `${outName}.png`);
  if (existsSync(file)) writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
  await sharp({
    create: {
      width: TILE,
      height: TILE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  ✓ ${file} (compose ${layers.length} layers)`);
}

async function composeAllFans(): Promise<void> {
  // tile-chest-sm — 3 티켓 fan (D7 보급 세트 ×10).
  // 손패처럼 아래쪽 anchor + 위로 펼침. z-order: 좌→우→중앙(중앙이 최상단).
  await composeFan(
    [
      { from: 'tile-weapon', rotate: -22, scale: 0.6, dx: -12, dy: 4 },
      { from: 'tile-accessory', rotate: 22, scale: 0.6, dx: 12, dy: 4 },
      { from: 'tile-armor', rotate: 0, scale: 0.6, dx: 0, dy: -2 },
    ],
    'tile-chest-sm',
  );

  // tile-chest-lg — 6 티켓 wider arch fan (D21 보급 세트 ×20).
  // 6장 가능한 한 겹침 줄여 개별 식별. 작은 scale + 넓은 dx + 위로 아치형 dy.
  await composeFan(
    [
      { from: 'tile-weapon', rotate: -40, scale: 0.42, dx: -19, dy: 10 },
      { from: 'tile-armor', rotate: -24, scale: 0.42, dx: -13, dy: 3 },
      { from: 'tile-accessory', rotate: -8, scale: 0.42, dx: -5, dy: -3 },
      { from: 'tile-weapon', rotate: 8, scale: 0.42, dx: 5, dy: -3 },
      { from: 'tile-armor', rotate: 24, scale: 0.42, dx: 13, dy: 3 },
      { from: 'tile-accessory', rotate: 40, scale: 0.42, dx: 19, dy: 10 },
    ],
    'tile-chest-lg',
  );
}

const only = process.argv[2];

if (only === 'fan' || only === 'compose') {
  // 합성만 실행 — 단일 티켓이 이미 있다는 전제
  await composeAllFans();
  process.exit(0);
}

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

// 단일 티켓 3종 또는 전체를 생성한 경우, fan/stack도 자동 합성.
const generatedSingles = targets.filter((s) => SINGLE_TICKETS.includes(s.name as (typeof SINGLE_TICKETS)[number]));
if (generatedSingles.length === SINGLE_TICKETS.length) {
  console.log('[checkin assets] 마일스톤 fan/stack 합성 중…');
  await composeAllFans();
}

process.exit(okCount === targets.length ? 0 : 1);
