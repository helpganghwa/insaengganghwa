// 오크 군락·타락 천사 부유섬 헤더 재생성 — 월드맵 톤/디테일에 맞춤. 실행: bun run scripts/gen-guild-region-fix2.ts
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'guild', 'region');

const COMMON =
  'detailed isometric game-map pixel art, no characters in foreground, wide panoramic distant view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, no transparent areas, no text';

const REGIONS: { name: string; prompt: string }[] = [
  {
    name: 'orc',
    prompt:
      'a vast orc warband settlement on pale sandy tan barren wasteland in daylight, ' +
      'jagged grey rock spires rising from the dust, many tall red war banners on poles and carved bone totems, ' +
      'a circular wooden spike palisade enclosure, scattered hide tents and crude bone structures, ' +
      'light tan and rusty brown earthy palette, bright overcast sky, ' + COMMON,
  },
  {
    name: 'angel',
    prompt:
      'a small dark floating island of broken holy ruins drifting in a dim twilight sky, ' +
      'cracked cream-colored classical temple pillars and toppled marble arches, ' +
      'a single tall dark weathered stone angel statue with spread wings, ' +
      'glowing violet mist and faint purple crystals on the dark rocky underside, scattered dark feathers, ' +
      'moody deep violet and slate palette, isolated island seen from afar, ' + COMMON,
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
console.log(`[region-fix2] ok ${ok} / ${REGIONS.length}`);
process.exit(ok === REGIONS.length ? 0 : 1);
