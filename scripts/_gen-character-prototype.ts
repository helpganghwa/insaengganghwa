// 캐릭터 prototype 생성 — Bitforge endpoint(style-consistent, RPG NPC 전용).
// 실행: bun run scripts/_gen-character-prototype.ts
// 출력: /tmp/character-prototype/blacksmith-bitforge.png (80×80)
//
// 디자인 결정(2026-05-25):
//  - 사이즈 80×80 = Pixellab Bitforge Tier 1 max(140×140은 PRO Tier 2+)
//  - portrait 구도 = Stardew Valley 대화 portrait 64×64 결
//  - 16-bit SNES JRPG NPC sprite 레퍼런스
//  - Bitforge는 style_image reference 가능(첫 시도엔 description만)

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

// 디자인 가이드(2026-05-25 v4):
// 16-bit SNES JRPG NPC portrait sprite — Stardew Valley Clint, Octopath Traveler,
// Chrono Trigger 결. 80×80 portrait, dot-art 명확, 16색 팔레트, 굵은 outline.
const STYLE =
  '16-bit SNES JRPG NPC dialogue portrait sprite, ' +
  'reference style: Stardew Valley Clint blacksmith portrait, Octopath Traveler NPC, Chrono Trigger character portrait, ' +
  'head and shoulders chibi portrait composition (face fills upper 60% of frame), ' +
  'centered front-facing, ' +
  'true low-resolution dot pixel art (every individual pixel clearly visible, no anti-aliasing), ' +
  'strict 16-color limited palette, ' +
  'thick bold 1-pixel black outline on every silhouette edge, ' +
  'flat 2D cel shading: 1 base tone + 1 shadow + 1 highlight per region (no blur, no gradient), ' +
  'fully filled solid dark background, no text, no UI elements';

const PROMPT =
  // 대장장이 — RPG NPC 정통 클리셰(드워프 비례, 큰 수염, 두건, 앞치마, 망치).
  'a fantasy RPG dwarf blacksmith NPC head-and-shoulders portrait, ' +
  'big round face with thick bushy brown beard covering chest, ' +
  'small round determined eyes with bold black pupils, ' +
  'tanned weathered skin with soot smudges on cheeks, ' +
  'wearing a brown leather forge cap pulled low, dark leather apron with iron rivets over a cream linen shirt collar, ' +
  'holding a small iron forge hammer raised over the right shoulder visible at frame edge, ' +
  'background: solid dark warm forge interior, subtle orange ember glow behind, ' +
  'palette: dark brown leather, iron grey, warm amber forge, cream skin, charcoal beard, ' +
  STYLE;

const NEGATIVE =
  'anti-aliasing, painted look, photo realistic, 3D render, soft brush, ' +
  'gradient blur, watercolor, modern clothing, sunglasses, hat with brim, ' +
  'multiple characters, full body, lower body visible, text, UI, frame border, ' +
  'jpeg artifacts';

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // Bitforge endpoint — Tier 1 max 80×80, Tier 2+ 140×140. 80은 portrait에 적정.
      // text_guidance_scale 12로 prompt 충실도 ↑. style_image 없이 description만.
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-bitforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          negative_description: NEGATIVE,
          image_size: { width: 80, height: 80 },
          text_guidance_scale: 12,
          no_background: false,
          view: 'side',
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
      // v4 — Bitforge + 80×80 portrait + 16-bit JRPG NPC 결.
      const file = join(OUT, 'blacksmith-bitforge.png');
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
