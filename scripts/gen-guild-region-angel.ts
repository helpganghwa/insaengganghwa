// 천사 부유섬 헤더 배경 재생성 — 부서진 천사상·제단·신성 유적(성당/성채 아님). 실행: bun run scripts/gen-guild-region-angel.ts
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
  'wide panoramic distant view, high detail, fully filled solid background, ' +
  'edge-to-edge composition, no transparent areas, no text';

const prompt =
  'a small floating sky island of ancient holy ruins drifting in a deep violet twilight void, seen from a distance; ' +
  'crumbling grey marble colonnade with broken classical columns and toppled arches, a ruined temple, NOT golden, NO domes, NO intact cathedral; ' +
  'a dark fallen-angel statue with huge spread BLACK feathered wings standing among the ruins; ' +
  'a glowing pale purple moon in the sky, scattered dark feathers drifting, eerie violet and purple glow, faint wisps of cloud below the island edge, ' + COMMON;

async function gen(): Promise<boolean> {
  const file = join(OUT, 'angel.png');
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
        console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return false;
      }
      const j = (await res.json()) as { image?: { base64?: string } };
      const b64 = j.image?.base64;
      if (!b64) return false;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return false;
      if (existsSync(file)) writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      writeFileSync(file, buf);
      console.log(`✓ ${file} (${buf.length}B)`);
      return true;
    } catch (e) {
      console.error('예외', (e as Error).message);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return false;
}

process.exit((await gen()) ? 0 : 1);
