// 길드 문양 모양(shape) 적용 테스트 — 톤(흑철)·키워드(용) 고정, 모양 6종만 바꿔 생성·비교.
//   실행: bun scripts/_test-emblem-shapes.ts  (PIXELLAB_API_KEY 유료 호출 6회)
import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync } from 'fs';

import { EMBLEM_SHAPES, buildEmblemPrompt } from '@/lib/game/guild/emblem-vocab';

const PIXFLUX_URL = 'https://api.pixellab.ai/v1/generate-image-pixflux';
const key = process.env.PIXELLAB_API_KEY;
if (!key) throw new Error('PIXELLAB_API_KEY missing');

const toneId = 'iron';
const keywordIds = ['dragon'];

for (const shape of EMBLEM_SHAPES) {
  const sel = { shapeId: shape.id, toneId, keywordIds };
  const prompt = buildEmblemPrompt(sel);
  console.log(`\n[${shape.id}] ${shape.ko} (${shape.en})`);
  console.log(`  prompt: ${prompt}`);
  const res = await fetch(PIXFLUX_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ description: prompt, image_size: { width: 128, height: 128 }, no_background: true }),
  });
  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  const j = (await res.json()) as { image?: { base64?: string } };
  const b64 = j.image?.base64;
  if (!b64) {
    console.error('  ✗ no base64');
    continue;
  }
  const path = `/tmp/emblem_${shape.id}.png`;
  writeFileSync(path, Buffer.from(b64, 'base64'));
  console.log(`  ✓ saved ${path}`);
}
console.log('\n완료');
process.exit(0);
