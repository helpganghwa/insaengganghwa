// 홈 메뉴 신규 2장(월드맵·길드) 생성 — gen-hub-menus.ts와 동일 레시피(솔리드 배경).
// 실행: bun run scripts/gen-hub-guild.ts (기존 파일은 .bak.png로 보존 후 덮어쓰기)
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
const OUT = join(process.cwd(), 'public', 'sprites', 'hub');

const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, ' +
  'no transparent areas, no empty space';

// 월드맵 카드는 실제 점령 지도(public/sprites/guild/worldmap.png)를 재활용 → 생성 대상은 길드홀만.
const MENUS: { name: string; prompt: string }[] = [
  {
    name: 'guild',
    prompt:
      'grand medieval guild hall interior, rows of heraldic banners and emblem ' +
      'shields hanging on tall stone walls, long wooden meeting table, fortress ' +
      'castle architecture, warm torchlight gathering atmosphere filling the entire ' +
      'scene, ' + COMMON,
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
          image_size: { width: 256, height: 256 },
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
      if (existsSync(file)) {
        writeFileSync(file.replace(/\.png$/, '.bak.png'), readFileSync(file));
      }
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
for (const m of MENUS) {
  const r = await gen(m.name, m.prompt);
  if (r === 'ok') ok++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[hub-guild] ok ${ok} · fail ${fail} / ${MENUS.length}`);
process.exit(fail > 0 ? 1 : 0);
