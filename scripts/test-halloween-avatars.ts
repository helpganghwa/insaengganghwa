// 할로윈 후보로 시험 아바타 만들기(2026-10-27) — 실서버와 같은 생성 경로(createCharacterV3: Claude 비전 합성 + Pixellab
// create-character-v3)를 **key3**로 돌려, 후보 아이템을 입힌 아바타가 어떻게 나오는지 채택 전에 본다. 유저·DB 무관.
// 실행: bun --conditions react-server scripts/test-halloween-avatars.ts            (누락 조합만 — 재개형, 유료)
//       bun --conditions react-server scripts/test-halloween-avatars.ts --dry      (조합만 출력)
// 출력: scripts/out/halloween-avatars-<set>/<n>.png(정면) + <n>.json — scripts/out은 커밋 제외.
//
// 후보는 카탈로그에 없으므로 **이 프로세스 안에서만** 카탈로그·스프라이트 표에 잠시 더한다(test-chuseok-avatars와 같은 방식).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { CATALOG_ITEMS, type CatalogItem } from '../lib/game/equipment/catalog';
import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';
import { createCharacterV3 } from '../lib/game/profile/pipeline-v3';
import { pixellabKeyByIdx } from '../lib/game/profile/pixellab-keys';
import { CANDIDATES } from './gen-halloween-cand';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY_IDX = 3;
const SET = Number(process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 1);
const OUT = join(process.cwd(), 'scripts', 'out', `halloween-avatars-${SET}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 생성된 그림을 보고 쓴 착용 묘사(영문) — compose가 이미지와 함께 읽는다. */
export const WORN: Record<string, string> = {
  hw7_vamp_parasol:
    'a black lace parasol with a scalloped canopy of layered black and grey lace printed with small crimson bat silhouettes, a big crimson satin bow tied on the slender black shaft, a pointed silver finial on top and a curved black crook handle with a tiny bat-wing ornament',
  hw5_vamp_cape:
    "a little vampire count costume: a long black cape lined in crimson with tiny bat prints, a very tall stand-up collar and scalloped bat-wing edges at the shoulders, worn over a black velvet jacket with gold piping and gold buttons, a dark waistcoat, a white jabot cravat with a red bow, puffy black bloomer shorts, red-and-black striped stockings and black buckled shoes",
  hw7_vamp_tophat:
    'a small grey-black silk top hat worn tilted on the head, with a crimson satin band and a little purple-and-red bat-wing brooch with a red gem pinned at the side',
  hw2_smith_hammer:
    'a big blacksmith sledgehammer with a heavy dark iron head that has a grumpy face with bushy curled eyebrows, a curled mustache and an open shouting mouth, one striking end glowing red-hot orange with flying sparks, a thick wooden handle wrapped in brown leather with iron bands',
  hw5_smith_apron:
    "a long worn brown leather blacksmith's apron with crossed shoulder straps and brass buckles, an anvil emblem stamped on the bib, a wide front pocket holding tongs, chisels and a file, stitched patches and a scorched darker hem, worn over a rolled-sleeve linen work shirt, dark trousers and sturdy leather boots",
  hw7_smith_kerchief:
    'a rust-red cloth kerchief tied snugly over the head with knotted tails hanging at the back, a riveted brown leather band around the forehead stamped with a small crossed-hammers emblem',
};

type Combo = { gender: 'male' | 'female'; weapon: string; armor: string; accessory: string };
const VAMP: Omit<Combo, 'gender'> = { weapon: 'hw7_vamp_parasol', armor: 'hw5_vamp_cape', accessory: 'hw7_vamp_tophat' };
/** 1차(10-27) — 꼬마 뱀파이어 세트 완성형, 남녀 2회씩(생성 편차 확인). */
export const COMBOS1: Combo[] = [
  { gender: 'male', ...VAMP },
  { gender: 'male', ...VAMP },
  { gender: 'female', ...VAMP },
  { gender: 'female', ...VAMP },
];
const SMITH: Omit<Combo, 'gender'> = { weapon: 'hw2_smith_hammer', armor: 'hw5_smith_apron', accessory: 'hw7_smith_kerchief' };
/** 2차(10-27) — 대장장이 세트 완성형, 남녀 2회씩. */
export const COMBOS2: Combo[] = [
  { gender: 'male', ...SMITH },
  { gender: 'male', ...SMITH },
  { gender: 'female', ...SMITH },
  { gender: 'female', ...SMITH },
];
const SETS: Record<number, Combo[]> = { 1: COMBOS1, 2: COMBOS2 };
export const COMBOS: Combo[] = SETS[SET] ?? COMBOS1;

/** 쓰이는 후보만 이 프로세스의 카탈로그·스프라이트 표에 더한다(파일·DB 변경 없음). */
function injectCandidates(): void {
  const used = new Set(COMBOS.flatMap((c) => [c.weapon, c.armor, c.accessory]));
  for (const c of CANDIDATES) {
    if (!used.has(c.key) || CATALOG_ITEMS.some((x) => x.key === c.key)) continue;
    if (!WORN[c.key]) throw new Error(`착용 묘사(WORN) 없음: ${c.key} — 생성 그림을 보고 먼저 쓸 것`);
    (CATALOG_ITEMS as CatalogItem[]).push({ key: c.key, slot: c.slot, nameKo: c.nameKo, region: '일반', lore: '', art: c.art, wornDesc: WORN[c.key] });
    SPRITE_MANIFEST[c.key] = `/sprites/halloween-cand/${c.key}.png`;
  }
  for (const k of used) if (!CATALOG_ITEMS.some((x) => x.key === k)) throw new Error(`후보 없음: ${k}`);
}

async function waitSouth(characterId: string, key: string): Promise<string | null> {
  for (let i = 0; i < 160; i++) {
    await sleep(6000);
    let r: Response;
    try {
      r = await fetch(`https://api.pixellab.ai/v2/characters/${characterId}`, { headers: { authorization: `Bearer ${key}` } });
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const j = (await r.json()) as { rotation_urls?: Record<string, string | null> };
    const south = j.rotation_urls?.south;
    if (typeof south === 'string' && south) return south;
  }
  return null;
}

async function main(): Promise<void> {
  if (process.argv.includes('--dry')) {
    COMBOS.forEach((c, i) => console.log(`${i + 1}. ${c.gender === 'male' ? '남' : '여'} ${c.weapon} · ${c.armor} · ${c.accessory}`));
    return;
  }
  injectCandidates();
  mkdirSync(OUT, { recursive: true });
  const key = pixellabKeyByIdx(KEY_IDX);
  const launched: { n: number; id: string }[] = [];
  for (const [i, c] of COMBOS.entries()) {
    const n = i + 1;
    const meta = join(OUT, `${n}.json`);
    if (existsSync(join(OUT, `${n}.png`))) continue;
    if (existsSync(meta)) {
      launched.push({ n, id: (JSON.parse(readFileSync(meta, 'utf8')) as { characterId: string }).characterId });
      continue;
    }
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
  }
  let ok = 0;
  await Promise.all(
    launched.map(async ({ n, id }) => {
      const url = await waitSouth(id, key);
      if (!url) {
        console.error(`  ${n} 대기 시간 초과(${id})`);
        return;
      }
      writeFileSync(join(OUT, `${n}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
      ok += 1;
      console.log(`  ✓ ${n} 완성`);
    }),
  );
  console.log(`\n완료 — 이번에 완성 ${ok} / 발주 ${launched.length}`);
}

if (process.argv[1]?.endsWith('test-halloween-avatars.ts')) void main();
