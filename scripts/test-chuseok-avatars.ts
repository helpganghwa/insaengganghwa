// 추석 후보로 시험 아바타 만들기(2026-09-19) — 실서버와 같은 생성 경로(createCharacterV3: Claude 비전 합성 + Pixellab
// create-character-v3)를 **key3**로 돌려, 후보 아이템을 입힌 아바타가 어떻게 나오는지 채택 전에 본다. 유저·DB 무관.
// 실행: bun --conditions react-server scripts/test-chuseok-avatars.ts            (누락 조합만 — 재개형, 유료)
//       bun --conditions react-server scripts/test-chuseok-avatars.ts --dry      (조합만 출력)
// 출력: scripts/out/chuseok-avatars/<n>.png(정면) + <n>.json(설명·외형·캐릭터 id) — scripts/out은 커밋 제외.
//
// 후보는 카탈로그에 없으므로 **이 프로세스 안에서만** 카탈로그·스프라이트 표에 잠시 더한다(compose가 키로
// 이미지·착용 묘사를 찾는다). wornDesc는 생성된 그림을 보고 쓴 착용 묘사 — 채택하면 카탈로그에 그대로 옮긴다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { CATALOG_ITEMS, type CatalogItem } from '../lib/game/equipment/catalog';
import { SPRITE_MANIFEST } from '../lib/game/equipment/sprite-manifest';
import { createCharacterV3 } from '../lib/game/profile/pipeline-v3';
import { pixellabKeyByIdx } from '../lib/game/profile/pixellab-keys';
import { CANDIDATES } from './gen-chuseok-cand';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const KEY_IDX = 3;
const OUT = join(process.cwd(), 'scripts', 'out', 'chuseok-avatars');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 생성된 그림을 보고 쓴 착용 묘사(영문) — compose가 이미지와 함께 읽는다. */
export const WORN: Record<string, string> = {
  chuseok_songpyeon_fork:
    'a long silver trident fork with three pointed prongs skewering three plump half-moon songpyeon rice cakes in pink, green and white, a small pine sprig and a red silk bow tied at the neck, a slender polished silver shaft',
  chuseok_moonrabbit_mallet:
    'a large pale wooden rice-cake mallet with a squared barrel head carved with a white moon rabbit before a golden full moon, a long wooden handle wrapped in red cord with small red tassels',
  chuseok_dokkaebi_club:
    'a thick knobbly brown wooden club studded with round dark iron nubs, tiny gold coins and sparkles spilling from its tip, a grip bound in braided yellow-and-brown rope',
  chuseok_hanbok:
    'a festive Korean hanbok: a crimson jeogori jacket with rainbow saekdong striped sleeves and gold cuff embroidery, a white collar, a long deep indigo sash tied in a bow, wide pale mint-green baji trousers with gold cloud embroidery at the hems',
  chuseok_moonrabbit_suit:
    'a plush white moon-rabbit costume jumpsuit of soft fluffy fur with ribbed cuffs, pink paw-pad mittens on the hands, fluffy white paw booties, a round golden full-moon patch on the chest',
  chuseok_moon_spacesuit:
    'a white padded lunar spacesuit with segmented quilted arms and legs, silver ring joints at the neck, elbows and knees, a round golden full-moon emblem on the chest, a small rabbit mission patch on the shoulder, white gloves and moon boots, a slim life-support pack on the back',
  chuseok_dokkaebi_mask:
    'a painted red dokkaebi goblin mask with two curved golden horns, bold black brows, bright round eyes and a wide toothy grin, a fringe of colorful teal, green and red tassels and gold beads around the top',
  chuseok_fullmoon_norigae:
    'a traditional Korean norigae charm: a round pale jade full-moon disc in a gold frame hanging from a knotted crimson silk cord, with a long flowing tassel of red and gold silk threads',
  chuseok_bok_pouch:
    'a round crimson silk bokjumeoni lucky pouch embroidered in gold with a moon rabbit pounding rice cakes before a full moon and swirling clouds, closed with a braided five-color drawstring cord ending in rainbow tassels',
};

/** 조합 — 방어구는 성별마다, 무기·장신구는 고루 돌린다(각 방어구 남녀 1회, 무기 2~3회, 장신구 남녀 1회 이상). */
export const COMBOS: { gender: 'male' | 'female'; weapon: string; armor: string; accessory: string }[] = [
  { gender: 'female', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_hanbok', accessory: 'chuseok_fullmoon_norigae' },
  { gender: 'male', weapon: 'chuseok_dokkaebi_club', armor: 'chuseok_hanbok', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'female', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_moonrabbit_suit', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_moonrabbit_suit', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'male', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_fullmoon_norigae' },
  { gender: 'female', weapon: 'chuseok_dokkaebi_club', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_bok_pouch' },
  { gender: 'female', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_hanbok', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'male', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_bok_pouch' },
];

/** 후보를 이 프로세스의 카탈로그·스프라이트 표에만 더한다(파일·DB 변경 없음). */
function injectCandidates(): void {
  for (const c of CANDIDATES) {
    if (CATALOG_ITEMS.some((x) => x.key === c.key)) continue;
    (CATALOG_ITEMS as CatalogItem[]).push({
      key: c.key,
      slot: c.slot,
      nameKo: c.nameKo,
      region: '일반',
      lore: '',
      art: c.art,
      wornDesc: WORN[c.key],
    });
    SPRITE_MANIFEST[c.key] = `/sprites/chuseok-cand/${c.key}.png`;
  }
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
  // 1) 발주 — 조합마다 Claude 합성 + Pixellab POST(순차, 429 백오프).
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
  // 2) 완성 대기 — 정면(south) 이미지를 받는다.
  let ok = 0;
  await Promise.all(
    launched.map(async ({ n, id }) => {
      const url = await waitSouth(id, key);
      if (!url) {
        console.error(`  ${n} 대기 시간 초과(${id})`);
        return;
      }
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(join(OUT, `${n}.png`), buf);
      ok += 1;
      console.log(`  ✓ ${n} 완성`);
    }),
  );
  console.log(`\n완료 — 이번에 완성 ${ok} / 발주 ${launched.length}`);
}

if (process.argv[1]?.endsWith('test-chuseok-avatars.ts')) void main();
