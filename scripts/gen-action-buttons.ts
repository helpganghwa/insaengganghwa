// 장비 상세 액션 버튼 배경 6장 — Pixellab → public/sprites/ui/btn-{action}.png
// 사이즈 128×80 (가로 직사각 — 3×2 그리드 버튼 비율). 솔리드 배경(sharp 후처리).
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
const OUT = join(process.cwd(), 'public', 'sprites', 'ui');

const COMMON =
  'dark atmospheric fantasy pixel art, no characters, no text, centered ' +
  'iconic composition, high detail, fully filled solid background, edge-to-edge, ' +
  'no transparent areas, no empty space';

const BUTTONS: { name: string; fill: { r: number; g: number; b: number }; prompt: string }[] = [
  {
    name: 'btn-enhance',
    fill: { r: 60, g: 24, b: 12 },
    prompt:
      'glowing red-hot anvil with a steel hammer striking down, bright orange ' +
      'sparks flying, deep crimson ember light, dungeon forge background, ' + COMMON,
  },
  {
    name: 'btn-transcend',
    fill: { r: 24, g: 16, b: 48 },
    prompt:
      'a single brilliant golden five-pointed star bursting in center, ' +
      'sparkling magical radiance, deep midnight blue cosmos background with ' +
      'faint smaller stars, mystical aura, ' + COMMON,
  },
  {
    name: 'btn-equip',
    fill: { r: 20, g: 30, b: 50 },
    prompt:
      'a steel breastplate armor on a wooden mannequin stand being fitted, ' +
      'shoulder plate gleaming, royal blue banner backdrop, candlelit armory, ' + COMMON,
  },
  {
    name: 'btn-lock',
    fill: { r: 32, g: 28, b: 16 },
    prompt:
      'a heavy iron padlock with golden trim closed shut on a thick chain, ' +
      'aged brass fittings, warm torch lighting, dark stone vault background, ' + COMMON,
  },
  {
    name: 'btn-disenchant',
    fill: { r: 42, g: 20, b: 20 },
    prompt:
      'a broken sword shattering into glowing magical fragments and a single ' +
      'large blue gem floating up, swirling sparkles, deep purple alchemical ' +
      'workshop background, ' + COMMON,
  },
  {
    name: 'btn-boast',
    fill: { r: 56, g: 36, b: 8 },
    prompt:
      'a tall ornate golden trophy with a glowing emblem held high, ' +
      'crimson victory banner draped behind, golden light rays, throne hall ' +
      'background, ' + COMMON,
  },
];

async function gen(b: (typeof BUTTONS)[number]): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, `${b.name}.png`);
  if (existsSync(file)) return 'skip';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: b.prompt,
          image_size: { width: 128, height: 80 },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${b.name} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${b.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${b.name} no base64`);
        return 'fail';
      }
      const raw = Buffer.from(b64, 'base64');
      if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) {
        console.error(`  ${b.name} bad PNG`);
        return 'fail';
      }
      const meta = await sharp(raw).metadata();
      const w = meta.width ?? 128;
      const h = meta.height ?? 80;
      const base = await sharp({
        create: { width: w, height: h, channels: 4, background: { ...b.fill, alpha: 1 } },
      })
        .png()
        .toBuffer();
      const buf = await sharp(base).composite([{ input: raw }]).png().toBuffer();
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${b.name} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

// 백업 후 재생성용 helper — 호출자가 .png 미리 백업.
let ok = 0;
let skip = 0;
let fail = 0;
for (const b of BUTTONS) {
  const r = await gen(b);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[action-buttons] ok ${ok} · skip ${skip} · fail ${fail} / ${BUTTONS.length}`);
// 모든 백업 클린업
process.exit(fail > 0 ? 1 : 0);
