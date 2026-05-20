// 보급 상자 배경 3장(슬롯별) — Pixellab pixflux → public/sprites/hub/box-{weapon,armor,accessory}.png
// 실행: bun run scripts/gen-gacha-boxes.ts
import { config } from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const BOXES: { slot: string; prompt: string }[] = [
  {
    slot: 'weapon',
    prompt:
      'ornate dark wooden treasure chest overflowing with a varied assortment of ' +
      'weapons — long sword, curved dagger, battle axe, spiked mace, spear, longbow, ' +
      'wooden staff — each clearly distinct and visible spilling out, golden brass ' +
      'corners, warm torch lighting, deep dungeon stone chamber filling the entire ' +
      'frame, ' + COMMON,
  },
  {
    slot: 'armor',
    prompt:
      'ornate dark wooden treasure chest overflowing with a wide assortment of armor ' +
      'pieces of clearly different shapes — a full plate breastplate, a horned ' +
      'barbarian helmet, a chainmail hooded shirt, a small round wooden shield, ' +
      'a tall pointed kite shield, leather riding boots, iron gauntlets, a winged ' +
      'great helm — every item visibly distinct silhouette (not just color), each ' +
      'recognizable as its own type, spilling out of the chest, golden brass ' +
      'corners, warm torch lighting, deep dungeon stone chamber filling the entire ' +
      'frame, ' + COMMON,
  },
  {
    slot: 'accessory',
    prompt:
      'ornate dark jewelry box overflowing with a wide assortment of accessories of ' +
      'clearly different shapes — a thick gold band ring with a ruby, a silver ' +
      'pendant necklace on chain, a small jeweled crown tiara, dangling teardrop ' +
      'earrings, a wide cuff bracelet, a circular medallion brooch, a triangular ' +
      'glowing talisman, a delicate anklet — every item visibly distinct ' +
      'silhouette (not just color), each recognizable as its own type, spilling ' +
      'out of the box, polished mahogany wood, golden brass corners, warm candle ' +
      'lighting, deep velvet boudoir chamber filling the entire frame, ' + COMMON,
  },
];

async function gen(slot: string, prompt: string): Promise<'ok' | 'skip' | 'fail'> {
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
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${slot} bad PNG`);
        return 'fail';
      }
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
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
  const r = await gen(b.slot, b.prompt);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[gacha-boxes] ok ${ok} · skip ${skip} · fail ${fail} / ${BOXES.length}`);
process.exit(fail > 0 ? 1 : 0);
