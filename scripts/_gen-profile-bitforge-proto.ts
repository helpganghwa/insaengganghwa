// 프로필 시스템 프로토 — bitforge REST + style_image (reference 3장).
// 컨셉: orc chieftain (직전 MCP create_character 시도와 동일 입력, 톤 비교용).
// 실행: bun run scripts/_gen-profile-bitforge-proto.ts
// 출력: /tmp/profile-proto/bitforge-{ref1,ref2,ref3}.png

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT = `${process.env.HOME}/Desktop/insaeng-proto`;
mkdirSync(OUT, { recursive: true });

const REFS = [
  { key: 'ref1-elf', file: '/Users/ryu/Desktop/스크린샷 2026-05-25 오후 3.42.25.png' },
  { key: 'ref2-adventurer', file: '/Users/ryu/Desktop/스크린샷 2026-05-25 오후 3.42.17.png' },
  { key: 'ref3-swordsman', file: '/Users/ryu/Desktop/스크린샷 2026-05-25 오후 3.42.30.png' },
];

const DESCRIPTION =
  'elegant young fantasy orc chieftain mascot character, ' +
  'slim adult bishonen body full body standing pose centered front-facing, ' +
  'huge anime doe eyes with multi-highlights, small nose, small lips, stoic neutral expression, ' +
  'voluminous deep black braided warrior hair with individual pixel strands, single small ahoge, ' +
  'dark forest green orcish chieftain breastplate with bright green tribal glyphs across the chest, animal tusks on each shoulder pauldron, ' +
  'deep brown leather kilt with bronze studs, knee-high lace-up worn leather boots, ' +
  'wide ornate gold neck collar with swirl patterns and a single large red ruby at center flanked by smaller rubies, ' +
  'right hand gripping the haft of a massive two-handed warhammer planted head-down at his side, hammer head a black stone wrapped with gold band, ' +
  'left hand relaxed at side, calm and authoritative chieftain stance, ' +
  'colored reddish-brown outline rim (not black), rich gradient cel shading, ' +
  'warm earthy palette with deep forest green, gold, ember red, dark brown, ' +
  'high-quality JRPG illustration pixel art style, pure white background, character only';

const NEGATIVE =
  'scary, ugly, deformed, monster, evil expression, sharp teeth, ' +
  'multiple characters, text, UI, frame border, jpeg artifacts, ' +
  'photo realistic, 3D render, painted soft blur, scenery, background';

async function gen(refKey: string, refFile: string): Promise<'ok' | 'fail'> {
  const resized = await sharp(refFile)
    .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 10 })
    .resize(140, 140, {
      fit: 'contain',
      kernel: sharp.kernel.nearest,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  writeFileSync(join(OUT, `_ref-trimmed-${refKey}.png`), resized);
  const refB64 = resized.toString('base64');

  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-bitforge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: DESCRIPTION,
          negative_description: NEGATIVE,
          image_size: { width: 140, height: 140 },
          style_image: { type: 'base64', base64: refB64 },
          style_strength: 50,
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
      const j = (await res.json()) as { image?: { base64?: string }; usage?: { usd?: number } };
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
      const file = join(OUT, `bitforge-${refKey}.png`);
      writeFileSync(file, buf);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const usd = j.usage?.usd ?? 0;
      console.log(`  ✓ ${file} (${buf.length}B · ${dt}s · $${usd})`);
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
  await new Promise((res) => setTimeout(res, 1000));
}
console.log(`\n[done] ok=${ok} fail=${fail} / ${REFS.length}`);
process.exit(fail > 0 ? 1 : 0);
