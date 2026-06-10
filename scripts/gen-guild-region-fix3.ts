// 늪지·오크·신전·천사 헤더 재생성 — kingdom/volcano와 동일한 배너 스타일 + 디테일 강화.
// 실행: bun run scripts/gen-guild-region-fix3.ts (기존 .bak.png 보존 후 덮어쓰기)
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
const OUT = join(process.cwd(), 'public', 'sprites', 'guild', 'region');

// kingdom/volcano와 동일한 원본 COMMON(배너 스타일).
const COMMON =
  'dark atmospheric fantasy pixel art landscape banner, no characters, wide panoramic view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, no transparent areas, no text';

const REGIONS: { name: string; prompt: string }[] = [
  {
    name: 'swamp',
    prompt:
      'a murky poisonous swamp, glowing green slime pools and twisted dead trees, ' +
      'a half-sunken ruined wooden hut on stilts, bubbling toxic ponds and luminous mushrooms, ' +
      'drifting sickly mist, sickly green and dark teal tones, ' + COMMON,
  },
  {
    name: 'orc',
    prompt:
      'a brutal orc warband encampment on cracked barren earth, tall wooden spike palisade walls, ' +
      'a large wooden watchtower, rows of hide tents and crude bone totems, tattered war banners and smoking campfires, ' +
      'rusty orange and dusty brown earthy tones, ' + COMMON,
  },
  {
    name: 'temple',
    prompt:
      'a frozen forgotten temple ruin in a snowfield, rows of broken white marble pillars and a great cracked stone archway, ' +
      'a half-buried ancient altar, snow-dusted pine forest behind, ' +
      'cold pale blue and silver tones, ' + COMMON,
  },
  {
    name: 'angel',
    prompt:
      'a floating island of fallen-angel ruins above the clouds, a tall white marble angel statue with spread wings at the center, ' +
      'shattered holy marble shrines and broken arches, scattered dark feathers drifting, ' +
      'eerie violet and pale gold glow, ' + COMMON,
  },
];

async function gen(name: string, prompt: string): Promise<boolean> {
  const file = join(OUT, `${name}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ description: prompt, image_size: { width: 400, height: 128 }, no_background: false }),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${name} HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        return false;
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return false;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return false;
      if (existsSync(file)) writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return true;
    } catch (e) {
      console.error(`  ${name} 예외`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return false;
}

let ok = 0;
for (const r of REGIONS) {
  if (await gen(r.name, r.prompt)) ok++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[region-fix3] ok ${ok} / ${REGIONS.length}`);
process.exit(ok === REGIONS.length ? 0 : 1);
