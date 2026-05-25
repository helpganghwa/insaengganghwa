// 캐릭터 생성 — Pixellab Bitforge + style_image reference.
// 사용자 reference 3장(픽셀법사키우기 결: JRPG 일러스트 픽셀화, 풀바디 정자세,
// 큰 머리/큰 눈, 흰 배경)을 한 장씩 style_image로 주입해 인생강화 컨셉 NPC 생성.
//
// 실행: bun run scripts/_gen-character-from-ref.ts
// 출력: /tmp/character-prototype/insaeng-blacksmith-ref{N}.png (3장 비교)
//
// PRO Tier 3 활용 — Bitforge 140×140 max. style_strength 60(중간).

import { config } from 'dotenv';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT = '/tmp/character-prototype';
mkdirSync(OUT, { recursive: true });
const REF_DIR = join(process.cwd(), 'public', 'sprites', 'characters');

const REFS = [
  { key: 'ref1-elf', file: 'ref-1-elf.png' },
  { key: 'ref2-adventurer', file: 'ref-2-adventurer.png' },
  { key: 'ref3-swordsman', file: 'ref-3-swordsman.png' },
];

// 인생강화 = 시간기반 idle + 한국식 강화. 첫 NPC = 대장장이(메인 anchor).
// reference 결: JRPG 일러스트 픽셀화, 큰 머리 + 큰 눈 + 그라데이션 + 흰 배경.
const DESCRIPTION =
  'a young apprentice blacksmith character, full body standing pose, T-pose centered front-facing, ' +
  'oversized expressive face with large round eyes and small mouth, ' +
  'short messy warm brown hair with golden highlights, ' +
  'wearing a thick dark brown leather forge apron with iron rivets over a cream linen shirt with rolled-up sleeves, ' +
  'small brown leather gloves, sturdy short brown boots, ' +
  'holding a chunky iron forge hammer at side (clearly recognizable as a hammer with square iron head and wooden handle), ' +
  'tiny soot smudge on cheek, calm friendly expression, ' +
  'palette: warm browns, soft cream, gentle peach skin, dark charcoal accents, hint of warm orange forge glow, ' +
  'high-quality JRPG illustration pixel art style, ' +
  'crisp pixel outlines with dark red-brown rim, ' +
  'gradient shading on hair and fabric, ' +
  'pure white background, character only, no scenery';

const NEGATIVE =
  'scary, dark, gritty, ugly, monster, evil expression, sharp teeth, ' +
  'wizard, mage, witch, robe, cloak, magic staff, wand, spellbook, hood, ' +
  'archer, bow, knight, sword, shield, helmet, armor plate, ' +
  'merchant, scholar, broom, ' +
  'multiple characters, text, UI, frame border, jpeg artifacts, ' +
  'photo realistic, 3D render, painted soft blur';

async function gen(refKey: string, refFile: string): Promise<'ok' | 'fail'> {
  const refPath = join(REF_DIR, refFile);
  if (!existsSync(refPath)) {
    console.error(`  reference 없음: ${refPath}`);
    return 'fail';
  }
  // 1) trim — 흰 배경 자동 제거(캐릭터 영역만 살림). 그래야 140 fit 시 캐릭터가 가득 참.
  //    원본은 1400+×600+이고 캐릭터 영역은 30~40%라 trim 안 하면 노이즈처럼 보임.
  // 2) 140×140 contain + nearest neighbor 보간으로 픽셀 결 보존 + 흰 배경 padding.
  const resized = await sharp(refPath)
    .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 10 })
    .resize(140, 140, {
      fit: 'contain',
      kernel: sharp.kernel.nearest,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const refB64 = resized.toString('base64');
  // 디버깅용 — trim된 reference도 저장해서 사용자가 비교 가능.
  writeFileSync(join(OUT, `_ref-trimmed-${refKey}.png`), resized);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-bitforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: DESCRIPTION,
          negative_description: NEGATIVE,
          image_size: { width: 140, height: 140 },
          style_image: { type: 'base64', base64: refB64 },
          style_strength: 50, // trim 후 더 좋은 reference라 style 약간 줄임(prompt 충실도 ↑)
          text_guidance_scale: 12,
          no_background: true,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${refKey} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${refKey} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${refKey} no base64`);
        return 'fail';
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${refKey} bad PNG`);
        return 'fail';
      }
      const file = join(OUT, `insaeng-blacksmith-${refKey}.png`);
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${refKey} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
let fail = 0;
for (const r of REFS) {
  console.log(`[${r.key}] generating...`);
  const result = await gen(r.key, r.file);
  if (result === 'ok') ok++;
  else fail++;
  // 페이싱 1s — 429 방어
  await new Promise((res) => setTimeout(res, 1000));
}
console.log(`\n[done] ok=${ok} fail=${fail} / ${REFS.length}`);
process.exit(fail > 0 ? 1 : 0);
