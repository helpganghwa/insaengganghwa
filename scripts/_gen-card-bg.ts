// DailySupplyCard 배경 PNG 생성 (Pixellab pixflux).
// 캐릭터 별도 합성용 — 우측 영역은 amber 광원으로 비워두고, 좌측~중앙에 보급 환경.
//
// 실행: bun run scripts/_gen-card-bg.ts
// 출력: public/sprites/hub/daily-supply-bg.png (384×96 wide banner)

import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT = join(process.cwd(), 'public', 'sprites', 'hub');
const FILE = join(OUT, 'daily-supply-bg.png');

const PROMPT =
  'horizontal wide banner background for fantasy RPG game daily supply UI card, ' +
  'no characters no people no faces no hands, ' +
  // 좌측 — 보급/보물 디테일
  'left third: open wooden treasure chest overflowing with golden coins and bright gemstones, ' +
  'gift box with red ribbon, scattered coins on wooden floor, ' +
  // 중앙 — 마법/장식
  'center third: floating glowing magical diamonds and gold ribbons drifting upward, ' +
  'small sparkle particles, soft warm light rays, ' +
  // 우측 — 캐릭터 자리(어둡지만 textured)
  'right third: warm amber glow ambient with subtle floating gold particles, ' +
  'no objects in right third (reserved for character overlay), ' +
  // 톤·스타일
  'cozy warm forge interior ambience with soft wooden plank texture in background, ' +
  'palette: deep warm brown, rich amber gold, soft cream highlights, dark mahogany shadows, ' +
  'Japanese anime pixel art game UI background style, ' +
  'soft gradient cel shading, crisp pixel art with detailed individual pixels, ' +
  'wide horizontal composition, edge-to-edge fully filled solid background, no transparent areas';

const NEGATIVE =
  'characters, people, faces, hands, weapons, swords, blurry, photo realistic, 3D render, ' +
  'modern UI elements, text, watermark, frame border, jpeg artifacts, white background, transparent';

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          negative_description: NEGATIVE,
          image_size: { width: 384, height: 96 }, // wide banner, ~4:1 ratio
          text_guidance_scale: 11,
          no_background: false,
        }),
      });
      if (res.status === 429) {
        const wait = 2000 * 2 ** attempt;
        console.error(`429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return 'fail';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error('bad PNG');
        return 'fail';
      }
      if (existsSync(FILE)) {
        writeFileSync(FILE.replace(/\.png$/, '.bak.png'), readFileSync(FILE));
      }
      writeFileSync(FILE, buf);
      console.log(`✓ ${FILE} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

const r = await gen();
process.exit(r === 'ok' ? 0 : 1);
