// 홈 메뉴 6장 재생성 — 배경 솔리드 보장(투명 없음).
// 실행: bun run scripts/gen-hub-menus.ts (기존 파일은 .bak로 보존 후 덮어쓰기)
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

// 공통 — 솔리드 배경 명시.
const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, ' +
  'no transparent areas, no empty space';

const MENUS: { name: string; prompt: string }[] = [
  {
    name: 'enhance',
    prompt:
      'torch-lit dungeon blacksmith forge interior with massive iron anvil, glowing ' +
      'hot weapon being hammered, sparks and embers, fire-lit stone walls and floor, ' +
      'red ember light filling the entire scene, ' + COMMON,
  },
  {
    name: 'inventory',
    prompt:
      'armory display rack room with three distinct sections clearly visible — ' +
      'left shelf with several swords and daggers, middle shelf with a steel ' +
      'breastplate and a plumed helmet, right shelf with a tray of glowing rings ' +
      'and gemstone amulets, all three sections equally prominent, lit by warm ' +
      'lantern glow, dark stained wood walls and floor, ornate brass fittings, ' +
      COMMON,
  },
  {
    name: 'gacha',
    prompt:
      'treasure vault chamber with massive ornate dark wooden chest in center, lid ' +
      'open, golden coins and sparkling gems spilling out, polished stone walls and ' +
      'floor, warm magical glow from inside the chest, deep golden amber light ' +
      'filling the entire room, ' + COMMON,
  },
  {
    name: 'raid',
    prompt:
      'ominous boss dungeon entrance — massive iron-bound stone doors with skull ' +
      'carvings, flanked by burning torches, glowing red runes on dark stone walls, ' +
      'crimson sinister light filling the scene, threatening atmosphere, ' + COMMON,
  },
  {
    name: 'profile',
    prompt:
      'heroic adventurer profile shield with crossed swords mounted on dark stone ' +
      'wall, draped tattered crimson banner backdrop, gleaming brass plaque, lit by ' +
      'flanking sconce torches, dark blue evening atmosphere filling the entire ' +
      'frame, ' + COMMON,
  },
  {
    name: 'ranking',
    prompt:
      'champion hall of victory — golden trophy on tall stone pedestal in center, ' +
      'laurel wreaths and victory banners, marble columns, glowing golden light rays ' +
      'streaming from above, royal red carpet floor, deep gold and crimson palette ' +
      'filling the entire scene, ' + COMMON,
  },
];

async function gen(name: string, prompt: string): Promise<'ok' | 'skip' | 'fail'> {
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
      // 기존 파일 백업.
      if (existsSync(file)) {
        const bak = file.replace(/\.png$/, '.bak.png');
        writeFileSync(bak, readFileSync(file));
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
console.log(`[hub-menus] ok ${ok} · fail ${fail} / ${MENUS.length}`);
process.exit(fail > 0 ? 1 : 0);
