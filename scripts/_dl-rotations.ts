// 기본 프로필 8방향 다운로드(일회성) — 생성된 캐릭터의 rotation_urls 8장을
// public/sprites/default/{gender}/{dir}.png로 저장. 실행: bun run scripts/_dl-rotations.ts
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY missing');
  process.exit(1);
}
const BASE = 'https://api.pixellab.ai/v2';
const CHARS: Record<string, string> = {
  male: 'ada89510-cb31-49f5-a5ff-94422d4443f0',
  female: '8197894c-b042-4f8a-9c8b-6532e6c5c6b5',
};
// [pixellab 키(하이픈), 저장 파일명(언더스코어=DB enum)]
const DIRS: [string, string][] = [
  ['south', 'south'],
  ['south-east', 'south_east'],
  ['east', 'east'],
  ['north-east', 'north_east'],
  ['north', 'north'],
  ['north-west', 'north_west'],
  ['west', 'west'],
  ['south-west', 'south_west'],
];

async function main() {
  for (const [g, id] of Object.entries(CHARS)) {
    const res = await fetch(`${BASE}/characters/${id}`, {
      headers: { authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) {
      console.error(`[${g}] GET ${res.status}: ${(await res.text()).slice(0, 150)}`);
      continue;
    }
    const c = (await res.json()) as { rotation_urls?: Record<string, string | null> };
    mkdirSync(`public/sprites/default/${g}`, { recursive: true });
    for (const [remote, local] of DIRS) {
      const u = c.rotation_urls?.[remote];
      if (!u) {
        console.warn(`  [${g}/${local}] missing`);
        continue;
      }
      const im = await fetch(u);
      if (!im.ok) {
        console.warn(`  [${g}/${local}] HTTP ${im.status}`);
        continue;
      }
      writeFileSync(`public/sprites/default/${g}/${local}.png`, Buffer.from(await im.arrayBuffer()));
      console.log(`  [${g}/${local}] ✓`);
    }
  }
  console.log('[done]');
}

main();
