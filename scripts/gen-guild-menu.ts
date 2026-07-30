// 길드홈 메뉴 그리드 4타일 배경 — gen-hub-*.ts와 동일 레시피(솔리드 배경 픽셀아트, 캐릭터 없음).
// 실행: bun run scripts/gen-guild-menu.ts  → public/sprites/guild-menu/{key}.png (기존은 .bak.png 보존)
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
const OUT = join(process.cwd(), 'public', 'sprites', 'guild-menu');
mkdirSync(OUT, { recursive: true });

const COMMON =
  'dark atmospheric fantasy pixel art, no characters, centered front view, ' +
  'high detail, fully filled solid background, edge-to-edge composition, ' +
  'no transparent areas, no empty space';

// 길드원(members)은 마음에 들어 유지 — 나머지는 길드원과 통일된 고딕 실내 결로 생성.
// 인자를 주면 그 키만 생성한다(기존 자산 무단 재생성 방지):
//   bun run scripts/gen-guild-menu.ts join roles tax emblem
const MENUS: { name: string; prompt: string }[] = [
  {
    name: 'deploy',
    prompt:
      'a grand gothic war room interior, a large illuminated territorial wall map and a central ' +
      'strategy table with carved flag markers, heraldic banners on tall arched stone walls, ' +
      'stained glass, warm chandelier and torchlight, deep amber-brown tone, ' + COMMON,
  },
  {
    name: 'settings',
    prompt:
      "a grand gothic guild master's chamber interior, an ornate desk with ledgers, a wax seal " +
      'and a hanging guild emblem banner, a high-backed chair, tall arched stone walls and ' +
      'stained glass, warm chandelier light, deep crimson tone, ' + COMMON,
  },
  {
    name: 'ranking',
    prompt:
      'a grand gothic hall of honor interior, golden trophies and engraved name plaques along ' +
      'tall arched stone walls, heraldic banners, stained glass windows, shafts of golden light, ' +
      'deep emerald-gold tone, ' + COMMON,
  },
  // ── 길드 관리 허브 타일(2026-07-30) — 홈 메뉴 카드와 같은 규격. members·settings는 재사용. ──
  {
    name: 'join',
    prompt:
      'a grand gothic guild hall entrance interior, a heavy open oaken door with an applicant ' +
      'register book on a carved lectern, quill and inkwell, heraldic banners on tall arched ' +
      'stone walls, stained glass, warm torchlight, deep amber tone, ' + COMMON,
  },
  {
    name: 'roles',
    prompt:
      'a grand gothic chamber interior, a ring of ornate brass keys hanging beside a wax seal ' +
      'stamp and an open oath ledger on a stone pedestal, heraldic banners on tall arched stone ' +
      'walls, stained glass, cool blue torchlight, deep indigo-blue tone, ' + COMMON,
  },
  {
    name: 'tax',
    prompt:
      'a grand gothic treasury vault interior, stacked gold coins and cut gemstones spilling ' +
      'from iron-bound chests, a brass weighing scale, heraldic banners on tall arched stone ' +
      'walls, stained glass, warm golden light, deep gold-brown tone, ' + COMMON,
  },
  {
    name: 'emblem',
    prompt:
      'a grand gothic heraldry workshop interior, a blank shield on a workbench with paint pots, ' +
      'brushes and metal stencils, finished emblem banners hanging on tall arched stone walls, ' +
      'stained glass, warm candlelight, deep emerald tone, ' + COMMON,
  },
];

// 인자 필터 — 없으면 전체(기존 동작 유지).
const only = new Set(process.argv.slice(2));
const TARGETS = only.size > 0 ? MENUS.filter((m) => only.has(m.name)) : MENUS;
if (only.size > 0 && TARGETS.length !== only.size) {
  console.error(`알 수 없는 키: ${[...only].filter((k) => !MENUS.some((m) => m.name === k)).join(', ')}`);
  process.exit(1);
}

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
for (const m of TARGETS) {
  const r = await gen(m.name, m.prompt);
  if (r === 'ok') ok++;
  else fail++;
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`[guild-menu] ok ${ok} · fail ${fail} / ${TARGETS.length}`);
process.exit(fail > 0 ? 1 : 0);
