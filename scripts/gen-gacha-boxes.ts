// 보급 상자 배경 3장(슬롯별) — Pixellab pixflux → public/sprites/hub/box-{weapon,armor,accessory}.png
// 실행: bun run scripts/gen-gacha-boxes.ts
import { config } from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'hub');

// 공통 — 솔리드 배경 보장(투명 영역 X).
const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, high ' +
  'detail, fully filled solid background, edge-to-edge composition, no transparent ' +
  'areas, no empty space';

// 새 컨셉 v4 — **장비 없음. 상자 자체 + 공간 분위기**만으로 슬롯 식별.
// 슬롯마다 상자 재질 · 공간 톤이 명확히 다름.
//   weapon: 강철·철띠 거친 상자, 어두운 대장간/화로 공간 (붉은 그림자)
//   armor: 강철·리벳 무거운 상자, 차가운 갑주 보관실 (푸른 회색)
//   accessory: 마호가니+황금 장식 보석함, 붉은 벨벳 부드러운 공간
const BOXES: { slot: string; prompt: string; fill: { r: number; g: number; b: number } }[] = [
  {
    slot: 'weapon',
    fill: { r: 28, g: 20, b: 16 }, // #1c1410 forge shadow
    prompt:
      'a single large closed treasure chest at center, the chest is made of dark ' +
      'iron and rough scorched dark wood with thick black iron bands and rusted ' +
      'rivets, a heavy iron padlock at the front, slightly battered worn surface, ' +
      'sitting alone on a soot-stained rough stone floor inside a deep blacksmith ' +
      'forge chamber, warm orange glow from a large stone forge on the right side ' +
      'casting long flickering shadows across the chest, hot embers and sparks float ' +
      'faintly in the dark air, rough soot-blackened stone walls and a hanging ' +
      'blacksmith hammer silhouette in the far background, no items around the ' +
      'chest, gritty rough hot blacksmith atmosphere, ' + COMMON,
  },
  {
    slot: 'armor',
    fill: { r: 28, g: 32, b: 48 }, // #1c2030 armory cold steel
    prompt:
      'a single large closed treasure chest at center, the chest is made of ' +
      'polished cold steel plates with thick riveted seams and a heavy bolted ' +
      'lock, very solid heavy knight-like construction, sitting alone on a cool ' +
      'pale stone floor inside an old castle armory chamber, soft pale blue ' +
      'moonlight pouring down from a high arched window with two muted blue ' +
      'torches at the corners casting cool light, polished stone walls and tall ' +
      'arched columns in the background, no items around the chest, quiet solemn ' +
      'cool knightly atmosphere, ' + COMMON,
  },
  {
    slot: 'accessory',
    fill: { r: 42, g: 22, b: 32 }, // #2a1620 velvet red
    prompt:
      'a single closed jewelry box at center, the box is made of polished deep ' +
      'mahogany wood with ornate golden brass corner fittings and a small filigree ' +
      'gold latch, very refined elegant smaller box, sitting alone on top of a ' +
      'polished mahogany table covered with deep red velvet cloth, warm flickering ' +
      'golden candle light from two ornate gold candelabras at the edges casting ' +
      'soft glowing reflections on the box, deep red velvet drapery wall background ' +
      'with gold ornament edges filling the entire frame, no items around the box, ' +
      'elegant refined warm boudoir parlor atmosphere, ' + COMMON,
  },
];

async function gen(
  slot: string,
  prompt: string,
  fill: { r: number; g: number; b: number },
): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, `box-${slot}.png`);
  if (existsSync(file)) return 'skip';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          image_size: { width: 256, height: 256 },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${slot} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${slot} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${slot} no base64`);
        return 'fail';
      }
      const raw = Buffer.from(b64, 'base64');
      if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) {
        console.error(`  ${slot} bad PNG`);
        return 'fail';
      }
      // sharp 후처리 — 솔리드 배경(slot tint) 위에 Pixellab 출력 합성. 투명
      // 영역(Pixellab pixflux가 가끔 alpha 출력)을 강제로 배경색으로 채움.
      const meta = await sharp(raw).metadata();
      const w = meta.width ?? 256;
      const h = meta.height ?? 256;
      const base = await sharp({
        create: {
          width: w,
          height: h,
          channels: 4,
          background: { ...fill, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const buf = await sharp(base).composite([{ input: raw }]).png().toBuffer();
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B) — bg ${fill.r},${fill.g},${fill.b}`);
      return 'ok';
    } catch (e) {
      console.error(`  ${slot} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
let skip = 0;
let fail = 0;
for (const b of BOXES) {
  const r = await gen(b.slot, b.prompt, b.fill);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[gacha-boxes] ok ${ok} · skip ${skip} · fail ${fail} / ${BOXES.length}`);
process.exit(fail > 0 ? 1 : 0);
