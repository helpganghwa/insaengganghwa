// 캐릭터 prototype 1장 생성 (대장장이 정자세) — 일관성 검증 anchor 용.
// 실행: bun run scripts/_gen-character-prototype.ts
// 출력: /tmp/character-prototype/blacksmith-default.png (256×256)
//
// 이 1장이 디자인 anchor. 채택되면 v2 style_images reference로
// 다른 4 NPC + 동일 캐릭터의 다른 포즈를 생성해서 일관성 평가.

import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT = '/tmp/character-prototype';
mkdirSync(OUT, { recursive: true });

// 캐릭터 디자인 가이드(2026-05-25 사용자 재피드백 반영):
// "판타지 RPG 게임 속 NPC + 2D 픽셀 캐릭터" — Stardew Valley / Octopath Traveler /
// Eastward / Moonlighter 같은 정통 픽셀 RPG NPC 결. chibi 2.5등신 유지하되
// 게임 NPC 정통성 강화 (드워프형, 큰 망치, 두건/모자 등 판타지 클리셰).
const STYLE =
  'classic 2D pixel art RPG game NPC, ' +
  'reference style: Stardew Valley / Octopath Traveler / Moonlighter NPC sprites, ' +
  '2.5-heads-tall chibi proportions, big head with simple expressive face, ' +
  'short stocky body and limbs, ' +
  'standing centered front-facing full body pose, ' +
  'crisp clean 2D pixel art with thick bold black outlines, ' +
  'large clearly visible pixels (low-resolution dot-art aesthetic), ' +
  'flat 2D cell shading with simple highlight + shadow tones (no painterly blur), ' +
  'limited 10-12 color palette, ' +
  'fully filled solid dark warm background, no other characters, no text, no UI elements, ' +
  'edge-to-edge composition';

const PROMPT =
  // 대장장이 — 정통 RPG NPC 클리셰(드워프형 + 큰 망치 + 가죽 앞치마 + 거친 두건).
  'a fantasy RPG blacksmith NPC character, dwarf-like short stocky build with broad shoulders, ' +
  'thick bushy brown beard covering chest, simple stern face with small round eyes, ' +
  'wearing a brown leather forge cap pulled low, ' +
  'heavy dark leather apron with metal rivets over a rolled-sleeve grey linen shirt, ' +
  'thick scorched leather gloves, big iron-tipped boots, ' +
  'holding a large two-handed iron forge hammer planted upright beside him, ' +
  'orange glowing forge embers behind, ' +
  'palette: dark brown leather, iron grey, warm amber forge glow, soft cream skin, charcoal beard, ' +
  STYLE;

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // 128 sweet-spot: 픽셀감 강조 + 캐릭터 디테일 충분. 256은 큰 픽셀 살리기 어려움.
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          image_size: { width: 128, height: 128 },
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
        console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return 'fail';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error('  bad PNG');
        return 'fail';
      }
      // v3 — RPG NPC + 2D 픽셀(드워프형 정통 대장장이).
      const file = join(OUT, 'blacksmith-rpg.png');
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

const r = await gen();
console.log(`[character-prototype] ${r}`);
process.exit(r === 'ok' ? 0 : 1);
