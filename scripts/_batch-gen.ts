// catalog region 단위 일괄 PNG 생성 — public/sprites/<slot>/<key>.png (128×128).
// 사용: bun run scripts/_batch-gen.ts <region> [--force]
//   <region> = '늪지대' | '오크 부락' | '고대 룬 산맥' | '서쪽 화산' | '타락천사' | '일반'
//   --force = 이미 있는 PNG도 덮어쓰기
import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const region = process.argv[2];
const keysArg = process.argv.find((a) => a.startsWith('--keys='));
const forceKeys = keysArg ? keysArg.slice('--keys='.length).split(',') : null;
if (!region && !forceKeys) {
  console.error('usage: bun run scripts/_batch-gen.ts <region> | --keys=k1,k2,...');
  process.exit(1);
}

const items = forceKeys
  ? CATALOG_ITEMS.filter((c) => forceKeys.includes(c.key))
  : CATALOG_ITEMS.filter((c) => c.region === region);
if (!items.length) {
  console.error(`대상 없음`);
  process.exit(1);
}

// catalog.art가 v4.2 원칙(NEG 마커) 적용되었는지.
const isVerifiedArt = (art: string): boolean => art.includes('no character, no scene');

// 검토 단계에서 _compare → public/sprites/로 손으로 복사한 검증 완료 PNG들.
// 이 키들의 PNG는 catalog.art가 v4.2여도 덮어쓰지 않는다(수동 검증된 결과 보존).
const PRESERVE_PNG_KEYS = new Set<string>([
  'lovesick_slime_dirk',
  'stone_golem_heart_maul',
  'lighthouse_keeper_harpoon',
  'inn_keeper_cleaver',
  'mountain_seven_words_chestplate',
  'widow_veil_shroud',
  'hero_dented_breastplate',
  'drowned_lovers_ring',
  'runeshard_amulet',
  'frogcall_silver_whistle',
]);

const OUT_BASE = join(process.cwd(), 'public', 'sprites');
for (const slot of ['weapon', 'armor', 'accessory'] as const) {
  mkdirSync(join(OUT_BASE, slot), { recursive: true });
}

console.log(`region "${region}" 시작 — 총 ${items.length}종`);

let done = 0;
let skipped = 0;
let fail = 0;

for (const item of items) {
  const out = join(OUT_BASE, item.slot, `${item.key}.png`);
  const exists = existsSync(out);
  const v42Art = isVerifiedArt(item.art);
  const preserve = PRESERVE_PNG_KEYS.has(item.key);
  // --keys로 지정되면 preserve와 v3 art 가드 모두 무시 강제 재생성.
  if (!forceKeys) {
    if (!v42Art) {
      console.log(`- ${item.slot}/${item.key} skip (v3 art, 다음 batch 대상)`);
      skipped++;
      continue;
    }
    if (exists && preserve) {
      console.log(`- ${item.slot}/${item.key} skip (preserve)`);
      skipped++;
      continue;
    }
  }
  let success = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          description: item.art,
          image_size: { width: 128, height: 128 },
          no_background: true,
        }),
      });
    } catch (err) {
      console.error(`[${item.key}] fetch error: ${String(err).slice(0, 200)} — 다음 키로 진행`);
      break;
    }
    if (res.status === 429) {
      const wait = 2000 * 2 ** attempt;
      console.error(`  [${item.key}] 429 → ${wait}ms 후 재시도`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      console.error(`[${item.key}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }
    const body = (await res.json()) as { image?: { base64?: string } };
    const b64 = body.image?.base64;
    if (!b64) {
      console.error(`[${item.key}] no base64`);
      break;
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      console.error(`[${item.key}] bad PNG`);
      break;
    }
    writeFileSync(out, buf);
    console.log(`✓ ${item.slot}/${item.key} (${buf.length}B)`);
    success = true;
    done++;
    break;
  }
  if (!success) fail++;
  await new Promise((r) => setTimeout(r, 800));
}

console.log(`done. +${done} 생성, ${skipped} skip, ${fail} 실패`);

// 새 sprite를 인게임에 반영하려면 atlas·asset-versions 재빌드 필수.
// 누락 시 atlas는 옛 그림 그대로 → 인게임 이름·이미지 어긋남.
if (done > 0) {
  console.log('\n[atlas·asset-versions 재빌드]');
  const { spawnSync } = await import('node:child_process');
  for (const cmd of [
    ['bun', ['run', 'scripts/build-sprite-atlas.ts']],
    ['bun', ['run', 'scripts/build-asset-versions.ts']],
  ] as const) {
    const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`✗ ${cmd[1].join(' ')} 실패 — 수동으로 다시 실행`);
      process.exit(1);
    }
  }
}
