// HubCheckinCard 배경 PNG 생성 (Pixellab pixflux).
// 28일 출석 캘린더(/checkin) 진입 wide 배너. 캐릭터 별도 합성 X — 우측은 amber 광원 비움.
//
// 실행: bun run scripts/_gen-card-bg-checkin.ts
// 출력: public/sprites/hub/checkin-bg.png (384×96 wide banner)

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
const FILE = join(OUT, 'checkin-bg.png');

const PROMPT =
  'horizontal wide banner background for fantasy RPG daily check-in calendar UI card, ' +
  'no characters no people no faces no hands, ' +
  // 좌측 — 출석판/달력
  'left third: ornate wooden fantasy calendar wall plaque with rows of small carved square slots, ' +
  'a few slots already marked with glowing wax stamp seals showing past attendance, ' +
  'rolled-up parchment day-counter, ' +
  // 중앙 — 떠있는 보급권/다이아 미리보기
  'center third: floating supply ticket scrolls and glowing magical crystal gems drifting upward, ' +
  'soft sparkle particles, a hovering small calendar page turning, ' +
  // 우측 — 빛 (마일스톤·다음 보상의 약속)
  'right third: warm amber glow ambient with floating golden particles, ' +
  'no objects in right third (reserved for character or text overlay), ' +
  // 톤·스타일 — daily-supply-bg와 시각 일관성 (warm postal-office cozy)
  'cozy fantasy guild hall ambience with soft warm lamp light, ' +
  'palette: warm cream parchment, deep brown wood, amber gold light, soft red wax accents, ' +
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
          image_size: { width: 384, height: 96 },
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
