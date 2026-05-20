// 인벤토리 메뉴 배경 1장 재생성 — Pixellab pixflux REST → public/sprites/hub/inventory.png
// 실행: bun run scripts/gen-hub-inventory.ts (기존 파일은 .bak로 보존 후 덮어쓰기)
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
const OUT = join(process.cwd(), 'public', 'sprites', 'hub', 'inventory.png');

const PROMPT =
  'armory display rack — three tier wooden shelves with neatly arranged ' +
  'gleaming swords, polished steel armor breastplates, and gold accessory ' +
  'rings, lit by warm lantern glow, dark stained wood, ornate brass fittings, ' +
  'dark dungeon-keep background, dark atmospheric fantasy pixel art, no ' +
  'characters, centered front view, high detail';

async function gen(): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
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
    if (existsSync(OUT)) {
      const bak = OUT.replace(/\.png$/, '.bak.png');
      writeFileSync(bak, readFileSync(OUT));
      console.log(`  백업: ${bak}`);
    }
    writeFileSync(OUT, buf);
    console.log(`  ✓ ${OUT} (${buf.length}B)`);
    return;
  }
  console.error('재시도 한계 초과');
  process.exit(1);
}

await gen();
