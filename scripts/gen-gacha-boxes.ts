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
      'ornate dark wooden treasure chest overflowing with FIVE clearly different ' +
      'types of armor with very distinct silhouettes — (1) a full chest plate ' +
      'breastplate (torso shape), (2) a closed iron helmet (head shape), (3) a ' +
      'large round shield (disc shape with metal boss in center), (4) tall ' +
      'leather boots (foot/leg shape), (5) iron gauntlets (hand/glove shape) — ' +
      'each item must be its OWN obvious type, not the same shape recolored; ' +
      'each spilling out of the chest fully visible, golden brass corners, warm ' +
      'torch lighting, deep dungeon stone chamber filling the entire frame edge ' +
      'to edge with stone walls and warm light, ' + COMMON,
  },
  {
    slot: 'accessory',
    prompt:
      'ornate dark jewelry box overflowing with FOUR clearly different types of ' +
      'accessories with very distinct silhouettes — (1) a gold chain necklace ' +
      'with a pendant (hanging chain shape), (2) a thick gold ring with a ruby ' +
      '(circular band shape), (3) a pair of dangling teardrop earrings (small ' +
      'hooked pair), (4) an ornate circular medallion brooch with a pin (flat ' +
      'disc with center jewel) — each item must be its OWN obvious type, not the ' +
      'same shape recolored; each spilling out of the box fully visible, polished ' +
      'mahogany wood, golden brass corners, warm candle lighting, deep velvet ' +
      'boudoir chamber filling the entire frame edge to edge with red velvet ' +
      'walls and warm light, ' + COMMON,
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
