// 길드 월드맵 상세 헤더용 지역 배경 6장 — gen-hub-menus 레시피(솔리드, 와이드 배너).
// 실행: bun run scripts/gen-guild-regions.ts (기존 .bak.png 보존 후 덮어쓰기)
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요 — .env.local');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'sprites', 'guild', 'region');
mkdirSync(OUT, { recursive: true });

const COMMON =
  'dark atmospheric fantasy pixel art landscape banner, no characters, wide panoramic view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, no transparent areas, no text';

// 월드맵 6지역(zone_region enum과 동일 키).
const REGIONS: { name: string; prompt: string }[] = [
  {
    name: 'volcano',
    prompt:
      'a brooding volcanic wasteland, black obsidian cliffs and rivers of glowing molten lava, ' +
      'erupting volcano with ash clouds, deep crimson and ember-orange glow, ' + COMMON,
  },
  {
    name: 'temple',
    prompt:
      'a frozen forgotten temple ruin in a snowfield, broken marble pillars and ancient stone arches, ' +
      'pine forest dusted with snow, cold pale blue and silver tones, ' + COMMON,
  },
  {
    name: 'swamp',
    prompt:
      'a murky poisonous swamp, glowing green slime pools and twisted dead trees, ' +
      'luminous mushrooms and toxic mist, sickly green and dark teal tones, ' + COMMON,
  },
  {
    name: 'orc',
    prompt:
      'a brutal orc warband encampment on cracked barren earth, wooden spike palisades, ' +
      'bone totems and war banners, campfires, rusty orange and dusty brown tones, ' + COMMON,
  },
  {
    name: 'kingdom',
    prompt:
      'a majestic white-walled human kingdom castle city, tall spires and banners, ' +
      'marble battlements catching warm light, regal gold and ivory tones, ' + COMMON,
  },
  {
    name: 'angel',
    prompt:
      'a floating island of fallen-angel ruins above the clouds, shattered holy marble shrines, ' +
      'broken angel statues with dark feathers, eerie violet and pale gold glow, ' + COMMON,
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
        const wait = 2000 * 2 ** attempt;
        console.error(`  ${name} 429 → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`  ${name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return 'fail';
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) {
        console.error(`  ${name} no base64`);
        return 'fail';
      }
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        console.error(`  ${name} bad PNG`);
        return 'fail';
      }
      if (existsSync(file)) writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      writeFileSync(file, buf);
      console.log(`  ✓ ${file} (${buf.length}B)`);
      return 'ok';
    } catch (e) {
      console.error(`  ${name} 예외 ${(e as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return 'fail';
}

let ok = 0;
let fail = 0;
for (const r of REGIONS) {
  const res = await gen(r.name, r.prompt);
  if (res === 'ok') ok++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[guild-regions] ok ${ok} · fail ${fail} / ${REGIONS.length}`);
process.exit(fail > 0 ? 1 : 0);
