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

// 디자인 가이드(2026-05-25 v6 — 카와이 풀바디 + 대장장이 정체성 강화 + PRO 140×140):
// 사용자 피드백: "카와이 OK / 대장장이 느낌 부족 / PRO Tier 3 가능".
// 변경: 풀바디 2등신 + 큰 망치 두 손 + 가슴~무릎 앞치마 + 모루·화로 배경 힌트.
const STYLE =
  'adorable kawaii chibi mascot pixel sprite, ' +
  'reference style: Cookie Run mobile game mascot, MapleStory NPC, Kirby cute character, ' +
  'Pokemon Mystery Dungeon chibi sprite, Korean/Japanese mobile cute pixel art, ' +
  'LINE Friends / Kakao Friends mascot pixelated, ' +
  'super deformed 2-heads-tall proportions, oversized perfectly round head, tiny rounded body and short limbs, ' +
  'big shining expressive black eyes with two bright white highlights each, ' +
  'tiny button nose, soft pink blushing cheek circles, wide warm friendly closed-mouth smile, ' +
  'standing centered front-facing FULL BODY pose, slight charming pose, ' +
  'smooth rounded silhouette with no sharp angular edges, ' +
  'clean 2D pixel dot art with crisp 1-pixel black outline, ' +
  'flat cel shading using 1 base tone + 1 soft shadow per region (no anti-aliasing, no gradient), ' +
  'soft warm palette (cream skin, brown leather, peach blush, warm amber forge glow, dusty pink), ' +
  'solid soft warm cream background with subtle orange forge glow on right side';

const PROMPT =
  // 대장장이 정체성 강화 — 큰 망치 + 가죽 앞치마 + 모루 배경.
  'a cute kawaii chibi mascot of a tiny apprentice BLACKSMITH character, full body, ' +
  // 복장 — 대장장이 시각 표지 명확히
  'wearing a THICK BROWN LEATHER FORGE APRON with clearly visible iron rivets on chest, ' +
  'apron covers torso and reaches above tiny knees, ' +
  'cream linen shirt with rolled-up sleeves underneath, ' +
  'small brown sturdy work boots, tiny brown leather gloves, ' +
  'small cute leather forge headband across forehead (not covering hair), short tousled brown hair, ' +
  // 소품 — 큰 망치 분명히
  'holding a CHUNKY ADORABLE FORGE HAMMER in both small hands held across body chest height, ' +
  'hammer clearly recognizable: large square iron head + short wooden handle, toy-like rounded proportions, ' +
  'tiny warm orange ember glow on hammer head tip, ' +
  // 배경 — 대장장이 환경 힌트
  'background: cozy cute forge interior, tiny dark anvil silhouette visible at bottom left ground level, ' +
  'soft warm orange forge glow ambient from right side, a few small floating orange sparkle dots around character, ' +
  // 디테일
  'tiny soot smudge on one cheek (adds charm), happy proud expression, ' +
  STYLE;

const NEGATIVE =
  'scary, dark, gritty, ugly, monster, evil expression, sharp teeth, ' +
  'dwarf, bushy beard, mustache, facial hair, muscular, adult man, weathered face, ' +
  // 다른 직업/소품 차단 — 대장장이로 명확히 가두기
  'wizard, mage, witch, robe, cloak, magic staff, wand, spellbook, hood, ' +
  'archer, bow, arrow, knight, sword, shield, helmet, armor plate, ' +
  'merchant, scholar, cooking pot, frying pan, broom, ' +
  // 시각 차단
  'harsh shadows, painted brush, anti-aliasing, photo realistic, 3D render, ' +
  'soft blur, gradient, watercolor, modern clothing, sunglasses, brimmed hat, ' +
  'multiple characters, head only, portrait, text, UI, frame border, jpeg artifacts';

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // Bitforge 140×140 — PRO Tier 2+ max. 풀바디 카와이 + 대장장이 디테일 충분.
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-bitforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          negative_description: NEGATIVE,
          image_size: { width: 140, height: 140 },
          text_guidance_scale: 14,
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
      // v6 — 카와이 풀바디 + 대장장이 정체성 강화 + 140×140 PRO.
      const file = join(OUT, 'blacksmith-kawaii-v6.png');
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
