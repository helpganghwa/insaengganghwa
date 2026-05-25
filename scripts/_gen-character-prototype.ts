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

// 디자인 가이드(2026-05-25 v5 — 동양 카와이 마스코트 결):
// 한국·중국·일본 모바일 픽셀 게임의 귀여운 마스코트 결 — Cookie Run, MapleStory,
// Kirby, Pokemon Mystery Dungeon, 라인프렌즈/카카오프렌즈 픽셀화. 서양 dwarf 컨셉 폐기.
// 핵심: 큰 둥근 머리(2등신) + 큰 반짝이는 눈 + 작은 버튼 코 + 분홍 볼 + 미소.
const STYLE =
  'adorable kawaii chibi mascot pixel sprite, ' +
  'reference style: Cookie Run mobile game mascot, MapleStory NPC, Kirby cute character, ' +
  'Pokemon Mystery Dungeon chibi sprite, Korean/Japanese mobile cute pixel art, ' +
  'LINE Friends / Kakao Friends mascot pixelated, ' +
  'super deformed 2-heads-tall proportions, oversized perfectly round head, tiny rounded body, ' +
  'big shining expressive black eyes with two bright white highlights each, ' +
  'tiny button nose, soft pink blushing cheek circles, wide warm friendly closed-mouth smile, ' +
  'centered front-facing head-and-shoulders portrait, slight head tilt for charm, ' +
  'smooth rounded silhouette with no sharp angular edges, ' +
  'clean 2D pixel dot art with crisp 1-pixel black outline, ' +
  'flat cel shading using 1 base tone + 1 soft shadow per region (no anti-aliasing, no gradient), ' +
  'soft warm pastel palette (cream, peach, light brown, soft amber, dusty pink), ' +
  'solid soft warm cream-orange background, no text, no UI, no other characters';

const PROMPT =
  // 대장장이 — 동양 카와이 마스코트. 거친 dwarf 폐기, 작고 둥글고 친근한 견습 대장장이.
  'a cute kawaii chibi mascot of a tiny apprentice blacksmith character, ' +
  'wearing a soft brown leather apron over a cream linen shirt collar, ' +
  'tiny round leather cap on top of head, small soft fingerless mittens, ' +
  'holding a tiny adorable toy-like forge hammer with rounded edges resting on shoulder, ' +
  'happy friendly expression, slightly closed eyes with bright highlights, ' +
  'palette: warm cream skin, soft brown leather, peach blush cheeks, gentle amber accent, ' +
  STYLE;

const NEGATIVE =
  'scary, dark, gritty, ugly, monster, evil expression, sharp teeth, ' +
  'dwarf, bushy beard, mustache, facial hair, muscular, adult man, weathered face, ' +
  'harsh shadows, painted brush, anti-aliasing, photo realistic, 3D render, ' +
  'soft blur, gradient, watercolor, modern clothing, sunglasses, brimmed hat, ' +
  'multiple characters, full body, lower body, legs, feet, text, UI, frame border, jpeg artifacts';

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // Bitforge 80×80 portrait + 카와이 prompt. text_guidance 14로 prompt 강조.
      // view 'side' 빼고 front-facing은 prompt에서 처리.
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-bitforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          negative_description: NEGATIVE,
          image_size: { width: 80, height: 80 },
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
      // v5 — 동양 카와이 마스코트 결(쿠키런/메이플/커비/포켓몬 미스던).
      const file = join(OUT, 'blacksmith-kawaii.png');
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
