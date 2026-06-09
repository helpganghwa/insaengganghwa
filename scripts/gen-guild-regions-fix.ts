// 오크 부락·슬라임 늪 헤더 배경 재생성 — '멀리서 본' 파노라마 강조. 실행: bun run scripts/gen-guild-regions-fix.ts
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
  'dark atmospheric fantasy pixel art landscape banner, no characters in foreground, ' +
  'wide panoramic distant view with low horizon, seen from afar, high detail, ' +
  'fully filled solid background, edge-to-edge composition, no transparent areas, no text';

const REGIONS: { name: string; prompt: string }[] = [
  {
    name: 'orc',
    prompt:
      'a sprawling orc tribe war camp village seen from a distance across barren cracked plains, ' +
      'dozens of crude wooden huts and hide tents clustered together, tall carved bone totems and ' +
      'ragged war banners, rising campfire smoke, distant jagged hills, rusty orange and dusty brown tones, ' +
      COMMON,
  },
  {
    name: 'swamp',
    prompt:
      'a vast murky slime swamp wetland seen from a distance, wide open marsh of glowing bright green ' +
      'slime pools and bog water stretching to the horizon, scattered bare twisted dead trees and ' +
      'luminous mushrooms, drifting toxic green mist, sickly green and dark teal tones, ' + COMMON,
  },
];

async function gen(name: string, prompt: string): Promise<'ok' | 'fail'> {
  const file = join(OUT, `${name}.png`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: prompt,
          image_size: { width: 400, height: 128 },
          no_background: false,
        }),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return 'fail';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
      if (existsSync(file)) writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${name} 예외 ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
for (const r of REGIONS) {
  if ((await gen(r.name, r.prompt)) === 'ok') ok++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[regions-fix] ok ${ok} / ${REGIONS.length}`);
process.exit(ok === REGIONS.length ? 0 : 1);
