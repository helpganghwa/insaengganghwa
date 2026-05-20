// OG 배경 아트 8장 생성 — Pixellab pixflux REST → public/og/og-1..8.png
//
// 퀄리티 ↑ (2026-05-20):
//   1) 생성 사이즈 200×120 → **400×240** (pixflux max에 가깝게)
//   2) sharp **1200×630 cover crop** + nearest neighbor 픽셀 보존 → OG 카드와 정확히 정합
//   3) 항상 덮어쓰기(이전 200×120 jagged 결과 교체)
//   4) prompt에 'intricate detail / atmospheric depth' 추가 — pixflux 디테일 강화
//
// 실행: bun run scripts/gen-og-bg.ts
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'og');
mkdirSync(OUT, { recursive: true });

const STYLE =
  'dark atmospheric fantasy pixel art, wide cinematic background scene, no characters, ' +
  'moody dramatic lighting, intricate detail, rich atmospheric depth, crisp pixel art';
const SCENES = [
  'ancient torch-lit dwarven forge hall with a large glowing anvil at center, floating ember sparks, glowing forge furnace, intricate stone arches',
  'torch-lit stone dungeon corridor with iron sconces casting warm light, drifting mist, mossy stone walls, dramatic depth perspective',
  'ruined moonlit castle courtyard with broken marble pillars, pale silver fog rolling between them, scattered fallen stones, distant moon',
  'vast volcanic cavern with rivers of glowing lava, ember sparks rising, jagged obsidian rock formations, deep red and orange glow',
  'moonlit battlefield aftermath, tattered banners on broken spears, scattered shields, distant jagged mountain silhouette under cold blue moonlight',
  'enchanted deep forest shrine with glowing blue runes on stone pillars, swirling fireflies, ancient roots, mystical pale-blue glow filtering through dense canopy',
  'frozen citadel hall of towering ice pillars under cold pale-blue light, crystalline reflections, icy mist swirling on the floor',
  'golden dawn breaking over a cliffside mountain fortress, dramatic warm sky with cloud layers, fortress silhouette against the rising sun',
];

async function fetchPixellab(prompt: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          image_size: { width: 400, height: 240 }, // pixflux 5:3 최대치
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return null;
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return null;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
      return buf;
    } catch (e) {
      console.error(`  예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return null;
}

async function gen(n: number, scene: string): Promise<'ok' | 'fail'> {
  const file = join(OUT, `og-${n}.png`);
  const raw = await fetchPixellab(`${scene}, ${STYLE}`);
  if (!raw) return 'fail';
  // 400×240 → 1200×630 cover crop, nearest neighbor 픽셀 보존.
  await sharp(raw, { failOn: 'none' })
    .resize(1200, 630, { fit: 'cover', position: 'center', kernel: 'nearest' })
    .png()
    .toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`  ✓ og-${n}.png (${meta.size ?? '?'}B, ${meta.width}×${meta.height})`);
  return 'ok';
}

// 동시성 2 + 800ms 페이싱.
const CONC = 2;
let i = 0;
let ok = 0;
let fail = 0;
async function worker() {
  while (i < SCENES.length) {
    const idx = i++;
    const r = await gen(idx + 1, SCENES[idx]!);
    if (r === 'ok') ok++;
    else fail++;
    await new Promise((r) => setTimeout(r, 800));
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`[og-bg] ok ${ok} · fail ${fail} / ${SCENES.length}`);
void existsSync; // (used elsewhere historically) — silence unused
process.exit(fail > 0 ? 1 : 0);
