// 출석 수령 섹션 배경 1장(불투명 wide) — Pixellab → public/sprites/checkin/claim.png
// 상단 배너(academy.png)와 톤 통일, 다른 장면(실내 보상 홀). 캐릭터 없음.
// 실행: bun run scripts/_gen-checkin-claim.ts
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'checkin', 'claim.png');

const PROMPT =
  'royal imperial fantasy academy interior reward hall, ornate golden columns and ' +
  'arches, a glowing pedestal at center holding a golden treasure chest with floating ' +
  'reward gems sparkling above it, warm chandelier and torch light, polished marble ' +
  'floor with a red carpet, hanging banners on the walls, opulent bright gold and ' +
  'crimson palette, warm magical glow, highly detailed pixel art, wide panoramic ' +
  'composition, no characters, fully filled solid background edge to edge, no ' +
  'transparent areas, no empty space, high detail';

async function gen(): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        description: PROMPT,
        image_size: { width: 400, height: 112 },
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
      console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const j = (await res.json()) as { image?: { base64?: string } };
    const b64 = j.image?.base64;
    if (!b64) {
      console.error('no base64');
      process.exit(1);
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      console.error('bad PNG');
      process.exit(1);
    }
    if (existsSync(OUT)) writeFileSync(OUT.replace(/\.png$/, '.bak.png'), readFileSync(OUT));
    writeFileSync(OUT, buf);
    console.log(`✓ ${OUT} (${buf.length}B)`);
    return;
  }
  console.error('재시도 한계 초과');
  process.exit(1);
}

await gen();
