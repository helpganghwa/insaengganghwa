// 강화 FX 4-tier 픽셀 이펙트 생성 — Pixellab pixflux.
// 단일 정적 프레임 96×96 (CSS keyframe과 합성).
// 실행: bun run scripts/_gen-fx-enhance.ts

import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), 'public', 'fx');

type Fx = { kind: string; description: string; negative: string };

const FX: Fx[] = [
  {
    kind: 'success-mega',
    description:
      'Golden magical burst effect, central radial flash of warm yellow-white light, ' +
      'four-pointed sparkle stars expanding outward in four cardinal directions, ' +
      'scattered glittering gem fragments and tiny ember motes around the burst, ' +
      'warm gold cream and amber palette with thin amber outline, ' +
      'classic JRPG anime pixel art VFX, ' +
      'clean crisp individual pixels, strong central focus, celebratory triumphant mood',
    negative:
      'character, person, weapon, background scene, dark mood, broken cracks, red blood colors, ' +
      'mascot, photorealistic, blurry, anti-aliased edges, watermark, text',
  },
  {
    kind: 'success',
    description:
      'Gentle green success spark effect, single bright emerald star burst in the center, ' +
      'soft circular light pulse halo around it, ' +
      'pastel mint and lime highlights with thin dark outline, ' +
      'a few tiny floating sparkle dots, ' +
      'classic JRPG anime pixel art VFX, ' +
      'clean crisp individual pixels, light cheerful pleasant feel',
    negative:
      'character, weapon, dark colors, cracks, red, gold burst, oversized, ' +
      'photorealistic, blurry edges, watermark, text',
  },
  {
    kind: 'hold',
    description:
      'Neutral gray mist drift effect, soft horizontal wisp of pale silver smoke flowing across the frame, ' +
      'three layered cloud puffs with subtle transparency gradient from light to dark gray, ' +
      'calm ethereal mood neither happy nor sad, ' +
      'classic JRPG anime pixel art VFX, ' +
      'clean crisp pixels, gentle floating motion suggestion',
    negative:
      'character, sparkle, burst, bright colors, red, gold, sad face, sharp shapes, ' +
      'photorealistic, anti-aliased, watermark, text',
  },
  {
    kind: 'down',
    description:
      'Red crack fracture effect, jagged crimson glowing crack lines branching upward from bottom center ' +
      'like broken stone or glass shattering, ' +
      'dark red core with bright orange-red highlight outline, ' +
      'a few small ember sparks scattered near the cracks, ' +
      'classic JRPG anime pixel art VFX, ' +
      'clean crisp individual pixels, weighty serious feel, not gory or violent',
    negative:
      'character, weapon, blood, gore, green colors, gold burst, happy mood, mascot, ' +
      'photorealistic, blurry, anti-aliased edges, watermark, text',
  },
];

async function genOne(fx: Fx): Promise<'ok' | 'fail' | 'skip'> {
  const file = join(OUT_DIR, `enhance-${fx.kind}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: fx.description,
          negative_description: fx.negative,
          image_size: { width: 96, height: 96 },
          text_guidance_scale: 11,
          no_background: true, // 투명 배경 (카드 오버레이용)
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`[${fx.kind}] 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`[${fx.kind}] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`[${fx.kind}] no base64`);
        return 'fail';
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`[${fx.kind}] bad PNG`);
        return 'fail';
      }
      if (existsSync(file)) {
        writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      }
      writeFileSync(file, buf);
      console.log(`✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`[${fx.kind}] 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

// 동시성 1 — 429 회피, 메모리 [pixellab-sprite-pipeline] 가이드.
let ok = 0;
let fail = 0;
for (const fx of FX) {
  const r = await genOne(fx);
  if (r === 'ok') ok++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800)); // gentle pacing
}

console.log(`\n결과: ok=${ok} / fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
