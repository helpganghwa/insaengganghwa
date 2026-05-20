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

// 새 컨셉 — 보물상자에서 탈피, 슬롯별 "장인 작업장" 환경.
// 가독성: 각 슬롯이 자기 직업의 무대를 가짐 → 한 눈에 슬롯 식별.
const BOXES: { slot: string; prompt: string; fill: { r: number; g: number; b: number } }[] = [
  {
    slot: 'weapon',
    fill: { r: 28, g: 20, b: 16 }, // #1c1410 forge ember
    prompt:
      'dark fantasy blacksmith forge interior scene, top-down isometric pixel art, ' +
      'large iron anvil at center with a finished long sword resting flat on top, ' +
      'glowing orange forge flames in the background, wooden weapon rack on the left ' +
      'holding a battle axe and a spear standing upright, a curved dagger and a ' +
      'blacksmith hammer lying on the wooden workbench on the right, scattered ember ' +
      'sparks floating in the warm air, deep stone forge chamber walls, ' + COMMON,
  },
  {
    slot: 'armor',
    fill: { r: 28, g: 32, b: 48 }, // #1c2030 armory steel
    prompt:
      'dark fantasy armory display chamber, top-down isometric pixel art, ' +
      'a tall wooden armor stand at center wearing a polished steel breastplate with ' +
      'a closed knight helmet placed on top of the stand, a large round metal shield ' +
      'hung on the back wall, a pair of iron gauntlets resting on a wooden table on ' +
      'the right, tall leather boots standing upright on the floor on the left, two ' +
      'lit braziers casting warm light, deep stone armory chamber walls, ' + COMMON,
  },
  {
    slot: 'accessory',
    fill: { r: 42, g: 22, b: 32 }, // #2a1620 velvet red
    prompt:
      'dark fantasy jeweler workshop scene, top-down isometric pixel art, ' +
      'a velvet-lined display table at center with each item on its own small velvet ' +
      'cushion clearly separated — a gold chain necklace with a teardrop pendant, ' +
      'a thick gold ring with a large red ruby, a pair of dangling earrings hung on ' +
      'a small stand, and an ornate circular medallion brooch — an ornate brass ' +
      'magnifying lens and small jeweler tweezers placed beside, soft warm candle ' +
      'glow from candelabras, deep mahogany jeweler parlor with red velvet walls, ' +
      COMMON,
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
