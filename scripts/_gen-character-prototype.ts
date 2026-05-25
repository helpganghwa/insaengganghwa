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

// 캐릭터 디자인 가이드(공통): 다크 판타지 픽셀, 1:1 정사각, 풀바디 정자세,
// 솔리드 어두운 배경(워크숍 톤), 깨끗한 외곽선, 제한 팔레트.
const STYLE =
  'detailed fantasy pixel art, clean outlines, limited palette, ' +
  'standing centered front-facing full body pose, ' +
  'fully filled solid dark workshop background with hint of warm orange forge glow, ' +
  'no characters in background, no text, no UI elements, ' +
  'edge-to-edge composition';

const PROMPT =
  // 대장장이(blacksmith) — 두꺼운 몸, 가죽 앞치마, 망치 손에. 인생강화 컨셉의 핵심 NPC.
  'a male fantasy blacksmith character — stocky strong build, thick black beard with grey streaks, ' +
  'focused weathered face, wearing rolled-sleeve linen shirt under a heavy brown leather apron, ' +
  'thick leather gloves, sturdy boots, holding a small forge hammer in right hand resting at side, ' +
  'left hand open, calm and confident stance, ' +
  'palette: deep brown leather, dark amber highlights, smoky umber, charcoal grey beard, ' +
  STYLE;

async function gen(): Promise<'ok' | 'fail'> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: PROMPT,
          image_size: { width: 256, height: 256 },
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
      const file = join(OUT, 'blacksmith-default.png');
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
