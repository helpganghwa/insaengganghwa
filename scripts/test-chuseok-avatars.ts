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
/** --set=2 → 2차(사극·민담 코스튬) 조합, --set=3 → 확정 6종(카탈로그 정본, 주입 없음). 출력 폴더도 따로. */
const SET = Number(process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 1);
const OUT = join(process.cwd(), 'scripts', 'out', SET >= 3 ? `chuseok-avatars-${SET}` : SET === 2 ? 'chuseok-avatars-2' : 'chuseok-avatars');
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
  // ── 2차(사극·민담 코스튬) ──
  chuseok_golden_axe:
    'a gleaming golden double-bladed axe with two broad polished gold crescent blades and a small cloud emblem at the center, a long pale wooden haft bound with gold rings',
  chuseok_hwando:
    'a Korean hwando saber with a slightly curved single-edged polished steel blade, a round brass guard, a black cord-wrapped hilt and a long red silk tassel hanging from the pommel',
  chuseok_foxfire_staff:
    'a slender pale birch staff whose curled top cradles a glowing orb of blue fox fire, with a bundle of fluffy white fox tails tied below it by a red cord',
  chuseok_gonryongpo:
    "a Joseon king's crimson silk gonryongpo robe with round golden dragon medallions on the chest and both shoulders, a jade-plaque belt with gold tassels at the waist, wide sleeves with gold-embroidered dark cuffs and a gold-embroidered hem",
  chuseok_dujeonggap:
    'a long crimson Joseon dujeonggap brigandine coat studded all over with rows of small brass rivets, blue trim along every edge, padded shoulder guards, a leather belt with a small pouch, split coat skirts over dark trousers and brown leather boots',
  chuseok_reaper_dopo:
    "a Korean grim reaper's long black silk dopo robe with very wide flowing sleeves, a pale cream inner collar and a thin dark red cord sash tied at the chest",
  chuseok_heungnip:
    'a Joseon black gat hat with a tall translucent black horsehair crown, a very wide flat round brim and a long string of amber beads hanging as the chin strap',
  chuseok_ikseongwan:
    "a Joseon king's ikseongwan crown hat of black silk with two upright rounded wing panels rising behind it, trimmed with a thin gold band and a small jade ornament at the front",
  chuseok_sangmo:
    'a small black pungmul sangmo hat with a large pink, teal and yellow paper flower on the front and a long white paper ribbon curling out from its top',
};

type Combo = { gender: 'male' | 'female'; weapon: string; armor: string; accessory: string };
/** 1차 조합 — 방어구는 성별마다, 무기·장신구는 고루 돌린다(각 방어구 남녀 1회, 무기 2~3회, 장신구 남녀 1회 이상). */
export const COMBOS1: Combo[] = [
  { gender: 'female', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_hanbok', accessory: 'chuseok_fullmoon_norigae' },
  { gender: 'male', weapon: 'chuseok_dokkaebi_club', armor: 'chuseok_hanbok', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'female', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_moonrabbit_suit', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_moonrabbit_suit', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'male', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_fullmoon_norigae' },
  { gender: 'female', weapon: 'chuseok_dokkaebi_club', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_bok_pouch' },
  { gender: 'female', weapon: 'chuseok_moonrabbit_mallet', armor: 'chuseok_hanbok', accessory: 'chuseok_dokkaebi_mask' },
  { gender: 'male', weapon: 'chuseok_songpyeon_fork', armor: 'chuseok_moon_spacesuit', accessory: 'chuseok_bok_pouch' },
];
/** 2차 조합 — 코스튬 완성형(왕·무관·저승사자·선비) + 새 방어구 남녀 1회씩, 새 장신구 남녀, 새 무기 2~3회. */
export const COMBOS2: Combo[] = [
  { gender: 'male', weapon: 'chuseok_hwando', armor: 'chuseok_gonryongpo', accessory: 'chuseok_ikseongwan' },
  { gender: 'female', weapon: 'chuseok_foxfire_staff', armor: 'chuseok_gonryongpo', accessory: 'chuseok_ikseongwan' },
  { gender: 'male', weapon: 'chuseok_hwando', armor: 'chuseok_dujeonggap', accessory: 'chuseok_heungnip' },
  { gender: 'female', weapon: 'chuseok_golden_axe', armor: 'chuseok_dujeonggap', accessory: 'chuseok_sangmo' },
  { gender: 'male', weapon: 'chuseok_foxfire_staff', armor: 'chuseok_reaper_dopo', accessory: 'chuseok_heungnip' },
  { gender: 'female', weapon: 'chuseok_hwando', armor: 'chuseok_reaper_dopo', accessory: 'chuseok_heungnip' },
  { gender: 'female', weapon: 'chuseok_golden_axe', armor: 'chuseok_hanbok', accessory: 'chuseok_heungnip' },
  { gender: 'male', weapon: 'chuseok_golden_axe', armor: 'chuseok_hanbok', accessory: 'chuseok_sangmo' },
];
/** 3차(09-23) — 확정 6종을 카탈로그 정본(wornDesc·wornDescMale·로어·스프라이트)으로 입힌다. 세트 완성형 남녀 + 교차 조합,
 *  한복 방어구는 남성 2회(치마→남성 정본 번역 확인이 목적). */
export const COMBOS3: Combo[] = [
  { gender: 'female', weapon: 'chuseok_moon_wand', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_moon_wand', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_rabbit_ears' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_rabbit_ears' },
  { gender: 'male', weapon: 'chuseok_moon_wand', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_bok_pouch' },
  { gender: 'female', weapon: 'chuseok_moon_wand', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_bok_pouch' },
];
/** 4차(09-23) — 3차 지적 3건(남성 한복이 한복으로 안 보임·절굿공이 형태 편차·여성 토끼 옷이 슈트로 축소) 문구 수정 뒤 재검증. */
export const COMBOS4: Combo[] = [
  { gender: 'male', weapon: 'chuseok_moon_wand', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_rabbit_ears' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_bok_pouch' },
];
/** 5차(09-23) — 4차 지적: 절굿공이가 야구방망이로, 남성 한복 두루마기가 망토로. 비유 제거·'hanbok' 명명 뒤 재검증(남성 한복 2·절굿공이 3). */
export const COMBOS5: Combo[] = [
  { gender: 'male', weapon: 'chuseok_moon_wand', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_rabbit_ears' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
];
/** 6차(09-23) — 5차 지적: 남성 한복이 여성 한복처럼(두루마기가 치마로 읽힘) → 저고리·배자·바지, 절굿공이는 양 끝 굵고 가운데 잘록한 형태. 남성 한복 2·절굿공이 3. */
export const COMBOS6: Combo[] = [
  { gender: 'male', weapon: 'chuseok_moon_wand', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_rabbit_ears' },
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_bok_pouch' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
];
/** 7차(09-23) — 절굿공이만: 'pestle' 곤봉 해석을 피해 '양 끝 같은 크기의 둥근 나무 덩이 + 곧은 자루'로. */
export const COMBOS7: Combo[] = [
  { gender: 'female', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_rabbit_suit', accessory: 'chuseok_rabbit_ears' },
  { gender: 'male', weapon: 'chuseok_rabbit_pestle', armor: 'chuseok_jade_hanbok', accessory: 'chuseok_bok_pouch' },
];
/** 8차(09-23) — 절굿공이만: 양 끝이 두껍고 가운데로 갈수록 서서히 얇아지는 나무 막대기(사용자 표현). 7차는 실수로 '덩이 두 개' 문구로 돌았다. */
export const COMBOS8: Combo[] = COMBOS7;
const SETS: Record<number, Combo[]> = { 1: COMBOS1, 2: COMBOS2, 3: COMBOS3, 4: COMBOS4, 5: COMBOS5, 6: COMBOS6, 7: COMBOS7, 8: COMBOS8 };
export const COMBOS: Combo[] = SETS[SET] ?? COMBOS1;

/** 후보를 이 프로세스의 카탈로그·스프라이트 표에만 더한다(파일·DB 변경 없음). */
function injectCandidates(): void {
  for (const c of CANDIDATES) {
    if (CATALOG_ITEMS.some((x) => x.key === c.key)) continue;
    if (!WORN[c.key]) throw new Error(`착용 묘사(WORN) 없음: ${c.key} — 생성 그림을 보고 먼저 쓸 것`);
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
  if (SET < 3) injectCandidates(); // 3차부터는 카탈로그 정본을 그대로 쓴다.
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
