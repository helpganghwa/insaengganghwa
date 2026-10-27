// 할로윈 확정 6종 + 무도회의 한 수(앵커 수정 뒤) 아바타 생성 테스트(2026-10-27) — 실서버와 같은 경로
// (createCharacterV3: Claude 비전 합성 + Pixellab create-character-v3)를 **key3**로. 카탈로그 정본 키 그대로(주입 없음). 유저·DB 무관.
// 실행: bun --conditions react-server scripts/test-halloween-final-avatars.ts        (누락분만 — 재개형, 유료)
//       bun --conditions react-server scripts/test-halloween-final-avatars.ts --dry  (조합만 출력)
// 출력: scripts/out/halloween-final/<n>.png(정면) + <n>.json — scripts/out은 커밋 제외.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';
import { createCharacterV3 } from '../lib/game/profile/pipeline-v3';
import { pixellabKeyByIdx } from '../lib/game/profile/pixellab-keys';
config({ path: '.env.local' });
config({ path: '.env', override: false });
const KEY_IDX = 3;
const OUT = join(process.cwd(), 'scripts', 'out', 'halloween-final');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Combo = { gender: 'male' | 'female'; weapon: string; armor: string; accessory: string; note: string };
const S = { weapon: 'halloween_smith_hammer', armor: 'halloween_smith_apron', accessory: 'halloween_smith_scarf' };
const V = { weapon: 'halloween_vamp_parasol', armor: 'halloween_vamp_cape', accessory: 'halloween_vamp_tophat' };
// 기존 장비(왕국 세트 첫 항목) — 할로윈 1~2부위만 섞었을 때.
const pick = (slot: 'weapon' | 'armor' | 'accessory') => CATALOG_ITEMS.find((c) => c.slot === slot && c.key.startsWith('kingdom_') && !c.key.includes('masque'))!.key;
const KW = pick('weapon'), KA = pick('armor'), KC = pick('accessory');
export const COMBOS: Combo[] = [
  { gender: 'male', ...S, note: '대장장이 세트 완성형' },
  { gender: 'female', ...S, note: '대장장이 세트 완성형' },
  { gender: 'male', ...V, note: '꼬마 백작 세트 완성형' },
  { gender: 'female', ...V, note: '꼬마 백작 세트 완성형' },
  { gender: 'male', ...S, note: '대장장이 세트 완성형(2회차, 편차)' },
  { gender: 'female', ...V, note: '꼬마 백작 세트 완성형(2회차, 편차)' },
  { gender: 'male', weapon: V.weapon, armor: S.armor, accessory: S.accessory, note: '교차: 양산 + 앞치마·두건' },
  { gender: 'female', weapon: S.weapon, armor: V.armor, accessory: V.accessory, note: '교차: 담금망치 + 망토·실크햇' },
  { gender: 'male', weapon: S.weapon, armor: KA, accessory: KC, note: '담금망치 + 기존 왕국 방어구·장신구' },
  { gender: 'female', weapon: V.weapon, armor: KA, accessory: KC, note: '양산 + 기존 왕국 방어구·장신구' },
  { gender: 'male', weapon: KW, armor: V.armor, accessory: V.accessory, note: '기존 왕국 무기 + 망토·실크햇' },
  { gender: 'female', weapon: KW, armor: S.armor, accessory: S.accessory, note: '기존 왕국 무기 + 앞치마·두건' },
  { gender: 'male', weapon: 'kingdom_masque_saber', armor: KA, accessory: KC, note: '무도회의 한 수(직선 날 앵커 수정 검증)' },
];

async function waitSouth(characterId: string, key: string): Promise<string | null> {
  for (let i = 0; i < 160; i++) {
    await sleep(6000);
    let r: Response;
    try { r = await fetch(`https://api.pixellab.ai/v2/characters/${characterId}`, { headers: { authorization: `Bearer ${key}` } }); } catch { continue; }
    if (!r.ok) continue;
    const j = (await r.json()) as { rotation_urls?: Record<string, string | null> };
    const south = j.rotation_urls?.south;
    if (typeof south === 'string' && south) return south;
  }
  return null;
}

async function main(): Promise<void> {
  for (const k of COMBOS.flatMap((c) => [c.weapon, c.armor, c.accessory])) if (!CATALOG_ITEMS.some((x) => x.key === k)) throw new Error(`카탈로그 없음: ${k}`);
  if (process.argv.includes('--dry')) {
    COMBOS.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. ${c.gender === 'male' ? '남' : '여'} ${c.weapon} · ${c.armor} · ${c.accessory}  — ${c.note}`));
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const key = pixellabKeyByIdx(KEY_IDX);
  const launched: { n: number; id: string }[] = [];
  for (const [i, c] of COMBOS.entries()) {
    const n = i + 1;
    const meta = join(OUT, `${n}.json`);
    if (existsSync(join(OUT, `${n}.png`))) continue;
    if (existsSync(meta)) { launched.push({ n, id: (JSON.parse(readFileSync(meta, 'utf8')) as { characterId: string }).characterId }); continue; }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await createCharacterV3({ gender: c.gender, weaponKey: c.weapon, armorKey: c.armor, accessoryKey: c.accessory, keyIdx: KEY_IDX });
        writeFileSync(meta, JSON.stringify({ ...c, characterId: r.characterId, appearance: r.appearance, description: r.description }, null, 2));
        launched.push({ n, id: r.characterId });
        console.log(`  발주 ${n} ${c.gender} → ${r.characterId}`);
        break;
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`  발주 ${n} 실패(${attempt + 1}): ${msg.slice(0, 160)}`);
        if (!msg.includes('429')) break;
        await sleep(15000 * (attempt + 1));
      }
    }
    await sleep(2000);
  }
  let ok = 0;
  await Promise.all(launched.map(async ({ n, id }) => {
    const url = await waitSouth(id, key);
    if (!url) { console.error(`  ${n} 대기 시간 초과(${id})`); return; }
    writeFileSync(join(OUT, `${n}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
    ok += 1; console.log(`  ✓ ${n} 완성`);
  }));
  console.log(`\n완료 — 이번에 완성 ${ok} / 발주 ${launched.length}`);
}
if (process.argv[1]?.endsWith('test-halloween-final-avatars.ts')) void main();
