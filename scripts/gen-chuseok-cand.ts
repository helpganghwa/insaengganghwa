// 추석 아이템 후보(2026-09-19) — Pixellab **객체**(create-1-direction-object) → public/sprites/chuseok-cand/<key>.png
// 실행: bun run scripts/gen-chuseok-cand.ts --dry            (프롬프트만 출력, 호출 없음)
//       bun run scripts/gen-chuseok-cand.ts                  (누락분만 생성 — 재개형, 유료: 실행 전 사용자 확인)
//       bun run scripts/gen-chuseok-cand.ts --only=key1,key2
//
// 기존 120종과 같은 방식(gen-weapon-cand.ts 정본): 객체 · view=sidescroller · 256px(단일 후보) · 슬롯 품질 꼬리표(items-v2 buildArt).
// 키는 **key3 고정**(추석 아이템 전용, 사용자 지정) — 객체 id를 obj-map-cand.json에 key3 라벨로 즉시 기록해,
// 나중에 해방 애니(gen-anim3)를 같은 키로 붙일 수 있게 한다.
// 프롬프트: 무기는 keeper 형식("<형태·재질·색>, <형용사> and <형용사>, clearly a <종류> weapon, no text, large, diagonal"),
// 방어구·장신구는 형태 핵심 + 분위기 형용사만(과도 나열 금지, 결과만 묘사).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { buildArt, type ItemV2 } from './items-v2';
import { scriptKeyFor } from './pixellab-script-key';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const LABEL = 'key3' as const;
const PIX = 'https://api.pixellab.ai/v2';
const SIZE = 256; // >170 → 단일 후보
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'sprites', 'chuseok-cand');
const MAP_PATH = join(ROOT, 'scripts', 'obj-map-cand.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ChuseokCand = {
  key: string;
  nameKo: string;
  slot: 'weapon' | 'armor' | 'accessory';
  concept: string;
  art: string;
  /** 1차(09-19 오후) · 2차(한국 사극·민담 코스튬, 09-19 저녁) · 3차(추석 풍경·햇곡식, 09-19 밤) · 4차(확정 컨셉 재생성, 09-19 밤) · 5차(확정 컨셉 다른 안, 09-19 밤) · 6차(한복=화려하게·달토끼=심플하게, 09-20) · 7차(두 세트 한 번 더 + 풍물놀이 세트, 09-20) · 8차(한복=단아하게·달토끼=동화풍 + 추수 세트, 09-20) · 9차(선택 폼 결과 — 미선택 3부위 재생성, 09-21) · 10차(선택 폼 2차 결과 — 4부위 재생성: 달·송편 무기 / 금박 한복 비슷한 안 / 장식 끈 없는 떡메·절굿공이 / 토끼 인형탈 전신 슈트, 09-21 밤). */
  batch: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
};

export const CANDIDATES: ChuseokCand[] = [
  // ── 무기 ─────────────────────────────────────────────────────────────────
  {
    key: 'chuseok_songpyeon_fork',
    nameKo: '송편 삼지창',
    slot: 'weapon',
    batch: 1,
    concept: '송편 찌른 포크',
    art:
      'a giant silver three-pronged fork skewering three plump half-moon songpyeon rice cakes in pastel pink, green and white, ' +
      'a small pine sprig tied at the neck with a red silk knot, a polished silver handle, ' +
      'playful and festive, clearly a trident fork weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_mallet',
    nameKo: '달토끼 떡메',
    slot: 'weapon',
    batch: 1,
    concept: '달토끼가 떡 찧는 떡메',
    art:
      'a large wooden rice-cake pounding mallet with a round barrel head of pale polished wood, ' +
      'a small white moon rabbit carved on its face beside a golden full moon inlay, a long smooth handle wrapped in red cord, ' +
      'charming and festive, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_dokkaebi_club',
    nameKo: '도깨비 방망이',
    slot: 'weapon',
    batch: 1,
    concept: '도깨비 방망이',
    art:
      'a dokkaebi goblin club — a thick knobbly wooden cudgel studded with rounded iron nubs, ' +
      'tiny golden coins and sparkles spilling from its tip, a braided rope grip, ' +
      'mischievous and magical, clearly a spiked club weapon, no text, large, diagonal',
  },
  // ── 방어구 ───────────────────────────────────────────────────────────────
  {
    key: 'chuseok_hanbok',
    nameKo: '한가위 한복',
    slot: 'armor',
    batch: 1,
    concept: '한복',
    art:
      'a festive Korean hanbok — a short jeogori jacket with rainbow saekdong striped sleeves, a deep indigo sash tied in a long bow, ' +
      'wide pale jade baji trousers, fine gold moon-and-cloud embroidery along the hems, elegant and joyful',
  },
  {
    key: 'chuseok_moonrabbit_suit',
    nameKo: '달토끼 옷',
    slot: 'armor',
    batch: 1,
    concept: '달토끼 인형탈',
    art:
      'a plush moon rabbit costume jumpsuit — soft fluffy white fur, a round cotton tail, pink paw-pad mittens, ' +
      'a small golden full-moon patch on the chest, cute and cozy',
  },
  {
    key: 'chuseok_moon_spacesuit',
    nameKo: '달나라 우주복',
    slot: 'armor',
    batch: 1,
    concept: '우주복(달나라)',
    art:
      'a sleek white lunar spacesuit with soft padded segments and silver joints, a golden full-moon emblem on the chest, ' +
      'a small rabbit mission patch on the shoulder, a slim life-support pack, bright and adventurous',
  },
  // ── 장신구 ───────────────────────────────────────────────────────────────
  {
    key: 'chuseok_dokkaebi_mask',
    nameKo: '도깨비 탈',
    slot: 'accessory',
    batch: 1,
    concept: '도깨비',
    art:
      'a painted dokkaebi goblin mask — a grinning red face with two small golden horns, bold black brows and bright round eyes, ' +
      'a fringe of colorful paper tassels along the top, lively and mischievous',
  },
  {
    key: 'chuseok_fullmoon_norigae',
    nameKo: '보름달 노리개',
    slot: 'accessory',
    batch: 1,
    concept: '보름달 노리개',
    art:
      'a traditional Korean norigae ornament — a round pale jade full-moon disc framed in gold, ' +
      'a knotted crimson silk cord and long flowing silk tassels in red and gold, graceful and luminous',
  },
  {
    key: 'chuseok_bok_pouch',
    nameKo: '한가위 복주머니',
    slot: 'accessory',
    batch: 1,
    concept: '복주머니',
    art:
      'a round silk lucky pouch bokjumeoni in deep red with a gold-embroidered moon rabbit and full moon, ' +
      'a drawstring of braided five-color cord with small tassels, festive and precious',
  },
  // ══ 2차: 한국 사극·민담 코스튬(09-19 저녁, 사용자 '코스튬플레이 하기 좋은 것') ══════════════
  // 시험 아바타 교훈 — 실루엣만으로 알아보는 물건 위주(작은 장식은 아바타에서 사라진다), 머리 장신구·전신 의상은 잘 산다.
  {
    key: 'chuseok_golden_axe',
    nameKo: '금도끼',
    slot: 'weapon',
    batch: 2,
    concept: '산신령 · 금도끼 은도끼',
    art:
      'a gleaming golden axe — a broad polished gold crescent blade with a soft radiant shine, a small cloud motif engraved near the edge, ' +
      'a straight pale wooden haft bound in gold rings, legendary and radiant, clearly a one-handed axe weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hwando',
    nameKo: '조선 환도',
    slot: 'weapon',
    batch: 2,
    concept: '조선 무관 · 사극 무사',
    art:
      'a Joseon hwando saber — a single slightly curved single-edged steel blade with a bright polished edge, a round brass guard, ' +
      'a black lacquered hilt wrapped in cord with a long red silk tassel hanging from the pommel, noble and disciplined, ' +
      'clearly a curved saber sword weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_foxfire_staff',
    nameKo: '여우불 지팡이',
    slot: 'weapon',
    batch: 2,
    concept: '구미호',
    art:
      'a nine-tailed fox spirit staff — a slender pale birch staff curling at the top around a floating orb of soft blue fox fire, ' +
      'small white fox-fur tails tied below the orb with a red cord, mystical and elegant, clearly a staff magic rod weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_gonryongpo',
    nameKo: '곤룡포',
    slot: 'armor',
    batch: 2,
    concept: '조선의 왕',
    art:
      "a Joseon king's gonryongpo dragon robe — a long crimson silk robe with round golden dragon medallions on the chest and shoulders, " +
      'a jade-plaque belt at the waist, wide sleeves with dark cuffs, majestic and regal',
  },
  {
    key: 'chuseok_dujeonggap',
    nameKo: '두정갑',
    slot: 'armor',
    batch: 2,
    concept: '조선 무관',
    art:
      'a Joseon dujeonggap brigandine coat armor — a long crimson padded coat studded with rows of round brass rivets, blue-trimmed edges, ' +
      'a leather belt, split coat skirts over dark trousers and boots, stately and martial',
  },
  {
    key: 'chuseok_reaper_dopo',
    nameKo: '저승사자 도포',
    slot: 'armor',
    batch: 2,
    concept: '저승사자',
    // 어두운 옷이라 슬롯 꼬리표의 'bright and stylish, not gothic'을 뺀 완성 프롬프트(buildArt가 그대로 쓴다).
    art:
      "a Korean grim reaper's black dopo robe — a long flowing black silk robe with very wide sleeves, a thin dark red sash tied at the chest, " +
      'a pale inner collar, solemn and elegant, a beautiful clean fantasy anime RPG gacha-game outfit, ' +
      'shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  },
  {
    key: 'chuseok_heungnip',
    nameKo: '흑립',
    slot: 'accessory',
    batch: 2,
    concept: '선비 · 저승사자 · 사극',
    art:
      'a Joseon black gat hat — a tall translucent black horsehair crown with a very wide flat round brim, ' +
      'a long string of dark amber beads as the chin strap, refined and scholarly',
  },
  {
    key: 'chuseok_ikseongwan',
    nameKo: '익선관',
    slot: 'accessory',
    batch: 2,
    concept: '조선의 왕',
    art: "a Joseon king's ikseongwan crown hat — a black silk crown with two upright rounded wing panels at the back, a subtle gold trim, dignified and regal",
  },
  {
    key: 'chuseok_sangmo',
    nameKo: '상모',
    slot: 'accessory',
    batch: 2,
    concept: '풍물놀이',
    art:
      'a Korean pungmul sangmo hat — a small black felt hat with a colorful paper flower on top ' +
      'and a very long white paper ribbon streaming from its crown in a graceful curve, lively and festive',
  },
  // ══ 3차: 추석 풍경·햇곡식(09-19 밤, 사용자 '좀 더 추석 한가위스럽게') ══════════════════════
  // 보름달·햇밤·전 부치기·가을 들판·선물 보자기처럼 추석에만 있는 소재. 실루엣으로 알아보는 형태 우선.
  {
    key: 'chuseok_chestnut_mace',
    nameKo: '밤송이 철퇴',
    slot: 'weapon',
    batch: 3,
    concept: '햇밤',
    art:
      'a chestnut burr mace — a large round spiky green chestnut burr head split open at the top to show glossy brown chestnuts, ' +
      'a sturdy dark wooden haft with a bronze collar and a red cord wrap, autumnal and sturdy, clearly a mace weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_jeon_spatula',
    nameKo: '전 뒤집개',
    slot: 'weapon',
    batch: 3,
    concept: '명절 전 부치기',
    art:
      'a giant polished brass cooking spatula with a wide flat square blade carrying a golden crispy round jeon pancake, ' +
      'a long lacquered wooden handle wrapped in red cord, cheerful and festive, clearly a giant spatula weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonlantern_staff',
    nameKo: '보름달 등불 지팡이',
    slot: 'weapon',
    batch: 3,
    concept: '달맞이',
    art:
      'a slender dark lacquered wooden staff curving into a hook at the top, a round glowing paper lantern shaped like a full moon hanging from the hook, ' +
      'a small moon rabbit silhouette on the lantern, a red silk tassel below, serene and luminous, clearly a staff magic rod weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrise_hanbok',
    nameKo: '달맞이 한복',
    slot: 'armor',
    batch: 3,
    concept: '강강술래',
    art:
      'a Korean hanbok — a white jeogori jacket with a deep indigo collar and a long indigo ribbon tie, ' +
      'a full-length flowing deep indigo chima skirt patterned with small silver full moons, graceful and luminous',
  },
  {
    key: 'chuseok_holiday_apron',
    nameKo: '명절 앞치마',
    slot: 'armor',
    batch: 3,
    concept: '명절 전 부치기',
    art:
      'a hanbok with a cooking apron — a soft pastel yellow jeogori jacket and a long pale green chima skirt, ' +
      'a crisp white cotton apron tied at the waist in a large bow with a small embroidered persimmon on its pocket, neat and cheerful',
  },
  {
    key: 'chuseok_scarecrow_outfit',
    nameKo: '허수아비 옷',
    slot: 'armor',
    batch: 3,
    concept: '가을 들판',
    art:
      'a charming scarecrow outfit — a faded blue work jacket with colorful cloth patches and golden straw poking out from the cuffs and collar, ' +
      'loose patched trousers tied with rope, a bundle of ripe golden rice stalks tucked at the belt, rustic and playful',
  },
  {
    key: 'chuseok_fullmoon_shield',
    nameKo: '보름달 방패',
    slot: 'accessory',
    batch: 3,
    concept: '한가위 보름달',
    art:
      'a round full-moon shield — a large pale golden disc glowing softly like the harvest moon, the faint silhouette of a rabbit pounding rice cakes on its face, ' +
      'a thin silver rim with small cloud engravings, serene and radiant',
  },
  {
    key: 'chuseok_moonrabbit_headband',
    nameKo: '달토끼 머리띠',
    slot: 'accessory',
    batch: 3,
    concept: '달토끼',
    art:
      'a moon rabbit ear headband — a slim gold band with two tall soft white rabbit ears lined in pale pink, ' +
      'a small golden full-moon ornament and a red silk ribbon at one side, cute and elegant',
  },
  {
    key: 'chuseok_gift_bojagi',
    nameKo: '명절 선물 보자기',
    slot: 'accessory',
    batch: 3,
    concept: '추석 선물',
    art:
      'a holiday gift bundle — a square box wrapped in rainbow saekdong striped silk bojagi cloth, tied on top in a neat knot with two pointed ends, ' +
      'a small gold moon charm hanging on a red tassel, festive and precious',
  },
  // ══ 4차: 확정 컨셉 재생성(09-19 밤) ════════════════════════════════════════════════════
  // 사용자 확정 — ① 한복 세트(무기 미정 → 합죽선 제안 · 한복 · 복주머니는 1차 그림 유지) ② 달토끼 세트(절굿공이 · 달토끼 옷 · 토끼 귀).
  // 한복 세트는 1차 복주머니(진홍 비단·금빛 달토끼·오색 끈)와 색을 맞춘다. 고급스러움 우선.
  {
    key: 'chuseok_hanbok_fan',
    nameKo: '합죽선',
    slot: 'weapon',
    batch: 4,
    concept: '한복 세트 무기(제안)',
    art:
      'a large folding war fan — polished dark bamboo ribs spread in a wide arc, a deep crimson silk leaf painted with a golden full moon over pale clouds, ' +
      'a gold-capped pivot with a long red silk tassel and a small five-color knot, elegant and graceful, clearly a war fan weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_v2',
    nameKo: '한가위 한복(재생성)',
    slot: 'armor',
    batch: 4,
    concept: '한복 세트 방어구',
    art:
      'a luxurious Korean hanbok — a pale jade silk jeogori jacket with rainbow saekdong striped sleeves and a long crimson ribbon tie, ' +
      'a full-length flowing deep crimson chima skirt with gold-leaf moon and cloud patterns along the hem, elegant and festive',
  },
  {
    key: 'chuseok_rabbit_pestle',
    nameKo: '달토끼 절굿공이',
    slot: 'weapon',
    batch: 4,
    concept: '달토끼 세트 무기',
    art:
      "a moon rabbit's long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends ringed in gold bands and a slim waisted grip in the middle, " +
      'the grip wrapped in red silk cord with a small golden full-moon charm, charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_suit_v2',
    nameKo: '달토끼 옷(재생성)',
    slot: 'armor',
    batch: 4,
    concept: '달토끼 세트 방어구',
    art:
      'a moon rabbit costume — a soft fluffy white fur jumpsuit with a big round fur collar, pale pink paw-pad mittens and fluffy white boots, a round cotton tail, ' +
      'a flowing pale lavender silk sash tied at the waist with a golden full-moon ornament, cute and elegant',
  },
  {
    key: 'chuseok_rabbit_ears',
    nameKo: '토끼 귀',
    slot: 'accessory',
    batch: 4,
    concept: '달토끼 세트 장신구',
    art:
      'a moon rabbit ear headpiece — two tall fluffy white rabbit ears lined in pale pink rising from a slim gold hairband, ' +
      'a small golden full-moon ornament and a short red silk ribbon at the base of one ear, cute and elegant',
  },
  // ══ 5차: 확정 컨셉 다른 안(09-19 밤) ═══════════════════════════════════════════════════
  // 사용자 지시 — 4차 그림도 후보로 두고 6종을 다시. 한복 세트 무기는 다른 컨셉(합죽선 → 청사초롱), 달토끼 세트는 달 장식을 덜어 낸다.
  // 한복 세트는 달·토끼 없이 금박 꽃무늬로(달토끼 세트와 소재가 겹치지 않게).
  {
    key: 'chuseok_hanbok_lantern',
    nameKo: '청사초롱',
    slot: 'weapon',
    batch: 5,
    concept: '한복 세트 무기(다른 안)',
    art:
      'a Korean cheongsachorong silk lantern on a long pole — a tall cylindrical lantern of red silk above and blue silk below glowing warmly from within, ' +
      'hanging from the curved tip of a long dark lacquered pole with gold fittings, a five-color silk tassel beneath the lantern, elegant and festive, ' +
      'clearly a lantern pole staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_v3',
    nameKo: '한가위 한복(다른 안)',
    slot: 'armor',
    batch: 5,
    concept: '한복 세트 방어구',
    art:
      'a luxurious Korean hanbok — a soft ivory silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing crimson chima skirt with a wide band of gold-leaf flower patterns along the hem, elegant and festive',
  },
  {
    key: 'chuseok_bok_pouch_v2',
    nameKo: '한가위 복주머니(다른 안)',
    slot: 'accessory',
    batch: 5,
    concept: '한복 세트 장신구',
    art:
      'a round silk lucky pouch bokjumeoni in deep crimson with gold-embroidered peony flowers and small clouds, ' +
      'a drawstring of braided five-color cord tied in a bow with small tassels, festive and precious',
  },
  {
    key: 'chuseok_rabbit_pestle_v2',
    nameKo: '달토끼 절굿공이(다른 안)',
    slot: 'weapon',
    batch: 5,
    concept: '달토끼 세트 무기',
    art:
      'a long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends and a slim waisted grip in the middle, ' +
      'a small rabbit face carved on one end, the grip wrapped in pink and white silk cord with a fluffy white pompom charm, ' +
      'charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_suit_v3',
    nameKo: '달토끼 옷(다른 안)',
    slot: 'armor',
    batch: 5,
    concept: '달토끼 세트 방어구',
    art:
      'a rabbit costume — a soft fluffy white fur jumpsuit with a big round fur collar, pale pink paw-pad mittens and fluffy white boots, a round cotton tail, ' +
      'a large pale pink silk ribbon bow at the collar with a small gold bell, cute and elegant',
  },
  {
    key: 'chuseok_rabbit_ears_v2',
    nameKo: '토끼 귀(다른 안)',
    slot: 'accessory',
    batch: 5,
    concept: '달토끼 세트 장신구',
    art:
      'a rabbit ear headpiece — two tall fluffy white rabbit ears lined in pale pink rising from a slim gold hairband, ' +
      'a pale pink silk ribbon bow with a small gold bell at the base of one ear, cute and elegant',
  },
  // ══ 6차: 사용자 피드백 '퀄리티가 별로' — 한복 세트는 화려하게(무기는 다른 종류), 달토끼 세트는 심플하게(09-20) ══
  // 한복 = 궁중 예복 수준(활옷·당의·금실 자수·구슬 술). 달토끼 = 장식을 걷어 낸 깨끗한 형태.
  {
    key: 'chuseok_hanbok_sword',
    nameKo: '의장검',
    slot: 'weapon',
    batch: 6,
    concept: '한복 세트 무기(검)',
    art:
      'a Korean royal ceremonial sword — a long straight double-edged steel blade inlaid with golden constellations, an ornate gold guard shaped like lotus petals, ' +
      'a crimson lacquered hilt wrapped in gold wire, a long flowing five-color silk tassel with jade beads hanging from the pommel, ' +
      'opulent and majestic, clearly a straight sword weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_bow',
    nameKo: '금박 각궁',
    slot: 'weapon',
    batch: 6,
    concept: '한복 세트 무기(활)',
    art:
      'a Korean royal horn bow — a strongly recurved bow lacquered in crimson with gold-leaf phoenix and cloud patterns, gold-capped tips, ' +
      'a grip wrapped in jade-green silk, a five-color silk tassel with jade beads, opulent and graceful, clearly a recurve bow weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_hwarot',
    nameKo: '활옷',
    slot: 'armor',
    batch: 6,
    concept: '한복 세트 방어구(궁중 예복)',
    art:
      'a magnificent Korean royal hwarot ceremonial robe — a long crimson silk robe densely embroidered with golden phoenixes, peonies and waves, ' +
      'very wide sleeves ending in rainbow saekdong stripes and white cuffs, a wide gold-embroidered sash hanging at the front, ' +
      'a deep blue inner skirt showing at the hem, opulent and regal, large',
  },
  {
    key: 'chuseok_hanbok_dangui',
    nameKo: '금박 당의',
    slot: 'armor',
    batch: 6,
    concept: '한복 세트 방어구(궁중 당의)',
    art:
      'a lavish Korean court hanbok — a jade-green silk dangui jacket with long curved front panels covered in gold-leaf patterns and a round gold-embroidered phoenix medallion on the chest, ' +
      'a crimson ribbon tie, a voluminous deep crimson chima skirt with two wide bands of gold-leaf flowers, a jeweled norigae tassel at the waist, opulent and elegant, large',
  },
  {
    key: 'chuseok_bok_pouch_v3',
    nameKo: '금실 복주머니',
    slot: 'accessory',
    batch: 6,
    concept: '한복 세트 장신구',
    art:
      'a lavish silk lucky pouch bokjumeoni — deep crimson silk densely embroidered in gold thread with a phoenix, peonies and clouds, ' +
      'small pearls and jade beads sewn along the gathered top, a thick braided five-color cord tied in an ornate knot with long jade-beaded tassels, opulent and precious',
  },
  {
    key: 'chuseok_rabbit_pestle_v3',
    nameKo: '절굿공이(심플)',
    slot: 'weapon',
    batch: 6,
    concept: '달토끼 세트 무기',
    art:
      'a simple wooden rice-cake pestle — a long smooth pale wooden pestle with two rounded club ends and a slim grip in the middle, ' +
      'a single thin red cord tied around the grip, clean and minimal, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_suit_v4',
    nameKo: '달토끼 옷(심플)',
    slot: 'armor',
    batch: 6,
    concept: '달토끼 세트 방어구',
    art:
      'a simple white rabbit costume — a plain soft white one-piece jumpsuit with a small round cotton tail, white mittens and white boots, ' +
      'a single small pink bow at the neck, clean and minimal, large',
  },
  {
    key: 'chuseok_rabbit_ears_v3',
    nameKo: '토끼 귀(심플)',
    slot: 'accessory',
    batch: 6,
    concept: '달토끼 세트 장신구',
    art: 'a simple rabbit ear headband — two tall plain white rabbit ears with soft pink inner lining on a thin white band, clean and minimal',
  },
  // ══ 7차: 사용자 지시 '추석 세트 6종 + 새 컨셉 한 세트 3종, 같은 방식으로'(09-20) ═══════════════════
  // 한복=화려하게·달토끼=심플하게를 한 번 더(세부만 바꿔 고를 폭을 넓힘) + 풍물놀이 세트(알록달록한 축제 — 앞 두 세트와 겹치지 않는 분위기).
  {
    key: 'chuseok_hanbok_sword_v2',
    nameKo: '의장검(용 새김)',
    slot: 'weapon',
    batch: 7,
    concept: '한복 세트 무기',
    art:
      'a Korean royal ceremonial sword — a long straight steel blade engraved with a golden dragon along its length, an ornate gold guard and a phoenix-head pommel, ' +
      'a crimson hilt wrapped in gold cord, a long flowing five-color silk tassel with jade and coral beads, opulent and majestic, clearly a straight sword weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_hwarot_v2',
    nameKo: '활옷(황금 치마)',
    slot: 'armor',
    batch: 7,
    concept: '한복 세트 방어구',
    art:
      'a magnificent Korean royal ceremonial hanbok — a long crimson silk robe over a golden-yellow skirt, densely embroidered with golden phoenixes, peonies and clouds, ' +
      'very wide sleeves with rainbow saekdong bands and white cuffs, a wide embroidered gold belt with a long front panel, jade ornaments, opulent and regal, large',
  },
  {
    key: 'chuseok_bok_pouch_v4',
    nameKo: '금실 복주머니(학 자수)',
    slot: 'accessory',
    batch: 7,
    concept: '한복 세트 장신구',
    art:
      'a lavish silk lucky pouch bokjumeoni — rich crimson silk embroidered in gold thread with a pair of cranes, peonies and clouds, a scalloped gathered top trimmed with pearls, ' +
      'a thick braided five-color cord tied in an ornate butterfly knot with long tassels of jade and coral beads, opulent and precious',
  },
  {
    key: 'chuseok_rabbit_pestle_v4',
    nameKo: '절굿공이(흰 리본)',
    slot: 'weapon',
    batch: 7,
    concept: '달토끼 세트 무기',
    art:
      'a simple wooden rice-cake pestle — a long smooth pale wooden pestle with thick rounded ends tapering to a slim grip in the middle, ' +
      'a small white ribbon tied at the grip, clean and minimal, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moonrabbit_suit_v5',
    nameKo: '달토끼 옷(보송한 결)',
    slot: 'armor',
    batch: 7,
    concept: '달토끼 세트 방어구',
    art:
      'a simple white rabbit costume — a plain soft white one-piece jumpsuit with a slightly fluffy texture, a small round cotton tail, ' +
      'white mittens and white boots with pale pink soles, a small pale pink ribbon at the neck, clean and minimal, large',
  },
  {
    key: 'chuseok_rabbit_ears_v4',
    nameKo: '토끼 귀(접힌 귀)',
    slot: 'accessory',
    batch: 7,
    concept: '달토끼 세트 장신구',
    art: 'a simple rabbit ear headband — two tall soft white rabbit ears with pale pink inner lining, one ear tip gently folded, on a thin white band, clean and minimal',
  },
  {
    key: 'chuseok_pungmul_banner',
    nameKo: '오색 깃발 창',
    slot: 'weapon',
    batch: 7,
    concept: '풍물놀이 세트 무기',
    art:
      'a Korean festival banner spear — a long red lacquered pole topped with a gold spearhead and a plume of pheasant feathers, ' +
      'a triangular crimson silk pennant edged with a five-color fringe flying below the tip, long red, blue and yellow silk streamers, ' +
      'festive and splendid, clearly a banner spear polearm weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_pungmul_outfit',
    nameKo: '풍물패 옷',
    slot: 'armor',
    batch: 7,
    concept: '풍물놀이 세트 방어구',
    art:
      'a Korean pungmul festival performer outfit — a crisp white hanbok jacket and white trousers under a sleeveless black vest with gold trim, ' +
      'three wide silk sashes in red, blue and yellow crossed over the chest and tied at the waist with long flowing ends, white leggings and straw-colored shoes, lively and festive, large',
  },
  {
    key: 'chuseok_pungmul_gokkal',
    nameKo: '꽃 고깔',
    slot: 'accessory',
    batch: 7,
    concept: '풍물놀이 세트 장신구',
    art:
      'a Korean gokkal festival hat — a tall white folded paper peaked hat covered with large paper flowers in red, yellow, blue and white, with white chin ribbons, lively and festive',
  },
  // ══ 8차: 사용자 지시 '6종 + 다른 컨셉 3종, 한복·토끼는 다른 느낌으로, 한복 무기도 다른 종류'(09-20) ══════════
  // 한복 = 단아하고 고운(미색·연분홍·연보라·은실 매화) + 무기는 은장도. 달토끼 = 동화풍 귀여움(떡 묻은 절굿공이·롬퍼·늘어진 귀).
  // 새 컨셉 = 추수(풍년). 롬퍼에 후드를 넣지 않는다 — 머리 윤곽이 같이 그려지는 실패(7차 달토끼 옷)를 피한다.
  {
    key: 'chuseok_hanbok_dagger',
    nameKo: '은장도',
    slot: 'weapon',
    batch: 8,
    concept: '한복 세트 무기(단아)',
    art:
      'a Korean eunjangdo ornamental silver dagger — a slender gleaming straight blade, an ornate engraved silver hilt inlaid with pale jade and pearls, ' +
      'a long lilac and white silk norigae tassel with a small butterfly knot hanging from the pommel, refined and graceful, clearly a dagger weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_hanbok_pastel',
    nameKo: '매화 한복',
    slot: 'armor',
    batch: 8,
    concept: '한복 세트 방어구(단아)',
    art:
      'an elegant Korean hanbok — an ivory silk jeogori jacket with a pale lilac ribbon tie and delicate silver-thread plum blossom embroidery on the sleeves, ' +
      'a full-length flowing soft pink chima skirt fading to pale lilac at the hem with scattered silver blossoms, a small pearl norigae at the waist, refined and graceful, large',
  },
  {
    key: 'chuseok_bok_pouch_v5',
    nameKo: '매화 복주머니',
    slot: 'accessory',
    batch: 8,
    concept: '한복 세트 장신구(단아)',
    art:
      'an elegant silk lucky pouch bokjumeoni — ivory and pale pink silk embroidered with silver-thread plum blossoms and a small butterfly, a gathered top, ' +
      'a braided lilac and white cord tied in a bow with pearl beads and soft tassels, refined and precious',
  },
  {
    key: 'chuseok_rabbit_pestle_v5',
    nameKo: '떡 묻은 절굿공이',
    slot: 'weapon',
    batch: 8,
    concept: '달토끼 세트 무기(동화풍)',
    art:
      'a cute rice-cake pestle — a chubby rounded pale wooden pestle with a slim grip in the middle, a soft white sticky rice cake blob stuck on the top end, ' +
      'a big pink ribbon bow tied at the grip, charming and adorable, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_romper',
    nameKo: '토끼 롬퍼',
    slot: 'armor',
    batch: 8,
    concept: '달토끼 세트 방어구(동화풍)',
    art:
      'a cute rabbit costume — a cream-white fluffy romper with puffy short legs, a big pale pink bow and two pompom buttons on the chest, fluffy cuffs, ' +
      'a round cotton tail, white knee socks and pink mary jane shoes, charming and adorable, large',
  },
  {
    key: 'chuseok_rabbit_lop_ears',
    nameKo: '늘어진 토끼 귀',
    slot: 'accessory',
    batch: 8,
    concept: '달토끼 세트 장신구(동화풍)',
    art:
      'a cute lop-eared rabbit headband — two long fluffy cream-white rabbit ears drooping down on both sides with pale pink inner lining, ' +
      'a pale pink ribbon bow on the band, charming and adorable',
  },
  {
    key: 'chuseok_harvest_sickle',
    nameKo: '황금 낫',
    slot: 'weapon',
    batch: 8,
    concept: '추수 세트 무기',
    art:
      'a golden harvest sickle — a large curved gleaming golden blade on a sturdy wooden handle, a bundle of ripe golden rice stalks tied to the neck with a red ribbon, ' +
      'bountiful and cheerful, clearly a sickle weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_harvest_outfit',
    nameKo: '가을걷이 옷',
    slot: 'armor',
    batch: 8,
    concept: '추수 세트 방어구',
    art:
      'an autumn harvest farmer outfit — a warm ochre cotton jacket with rolled sleeves over a cream shirt, a woven straw vest, loose indigo trousers tied at the ankles with straw rope, ' +
      'a belt pouch overflowing with chestnuts and persimmons, a sheaf of golden rice tucked at the back, bountiful and cheerful, large',
  },
  {
    key: 'chuseok_harvest_hat',
    nameKo: '참새 밀짚모자',
    slot: 'accessory',
    batch: 8,
    concept: '추수 세트 장신구',
    art:
      'a woven straw hat — a wide round golden straw hat decorated with ripe rice stalks and a red ribbon band, a small brown sparrow perched on the brim, bountiful and cheerful',
  },
  // ══ 9차: 선택 폼 결과(09-21) — 확정: 한복(금박 꽃무늬)·한가위 복주머니·토끼 귀(접힌 귀). 미선택 3부위를 3가지씩 ══════════
  // 한복 무기 = 사용자 지시 '달 완드'(확정한 한복·복주머니의 진홍·금색에 맞춤). 달토끼 무기·방어구 = 사유 없음 →
  // 지금까지 탈락한 절굿공이·점프슈트형을 피해 방향을 넓힌다(떡메 / 한복·망토·투피스). 확정한 접힌 귀의 깨끗한 흰색에 맞춘다.
  {
    key: 'chuseok_moon_wand_full',
    nameKo: '보름달 완드',
    slot: 'weapon',
    batch: 9,
    concept: '한복 세트 무기(달 완드)',
    art:
      'a moon wand — a slender crimson lacquered wand with gold fittings topped by a large glowing golden full moon disc ringed with small golden clouds, ' +
      'a faint rabbit silhouette on the moon, a five-color silk tassel with jade beads hanging below the head, opulent and elegant, clearly a magic wand weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moon_wand_crescent',
    nameKo: '초승달 완드',
    slot: 'weapon',
    batch: 9,
    concept: '한복 세트 무기(달 완드)',
    art:
      'a crescent moon wand — a slender ivory and gold wand topped by a large golden crescent moon cradling a small glowing pearl, ' +
      'a crimson silk ribbon and a five-color tassel tied below the head, graceful and luminous, clearly a magic wand weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moon_wand_jade',
    nameKo: '옥 보름달 완드',
    slot: 'weapon',
    batch: 9,
    concept: '한복 세트 무기(달 완드)',
    art:
      'a moon wand — a long crimson lacquered rod with gold-leaf flower patterns, topped by a round pale jade full moon framed in a gold ring with tiny gold stars, ' +
      'long crimson and gold silk tassels, regal and elegant, clearly a magic wand weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_mallet_v2',
    nameKo: '흰 떡메',
    slot: 'weapon',
    batch: 9,
    concept: '달토끼 세트 무기',
    art:
      'a simple rice-cake mallet — a large smooth round barrel head of pale white wood on a long slim handle, a small rabbit face stamped on the head, ' +
      'a white ribbon at the neck, clean and minimal, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_pestle_v6',
    nameKo: '절굿공이(굵은 양끝)',
    slot: 'weapon',
    batch: 9,
    concept: '달토끼 세트 무기',
    art:
      'a simple double-headed rice-cake pestle — a long pale white wooden pestle with two large bulbous rounded heads and a narrow waist grip in the middle, ' +
      'a soft pink cord wrapped at the grip, clean and minimal, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_mallet_mochi',
    nameKo: '떡 늘어지는 떡메',
    slot: 'weapon',
    batch: 9,
    concept: '달토끼 세트 무기',
    art:
      'a cute rice-cake mallet — a chubby pale wooden mallet with a round barrel head, a soft white sticky rice cake stretching from the head, ' +
      'a pale pink ribbon bow on the handle, clean and charming, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_hanbok',
    nameKo: '토끼 한복',
    slot: 'armor',
    batch: 9,
    concept: '달토끼 세트 방어구',
    art:
      'a white rabbit hanbok — a soft white jeogori jacket with a pale pink ribbon tie under a short fluffy white fur vest, white baggy trousers gathered at the ankles, ' +
      'fluffy white fur cuffs, a round cotton tail, clean and charming, large',
  },
  {
    key: 'chuseok_rabbit_cape',
    nameKo: '토끼 망토 코트',
    slot: 'armor',
    batch: 9,
    concept: '달토끼 세트 방어구',
    art:
      'a white rabbit cape coat — a short fluffy white fur-trimmed cape with two round pompom ties over a simple white knee-length coat dress, ' +
      'white tights and fluffy white boots, a round cotton tail, clean and elegant, large',
  },
  {
    key: 'chuseok_rabbit_twopiece',
    nameKo: '토끼 투피스',
    slot: 'armor',
    batch: 9,
    concept: '달토끼 세트 방어구',
    art:
      'a simple white rabbit outfit — a cropped fluffy white jacket with a round collar and one pale pink ribbon, white shorts with a round cotton tail, ' +
      'fluffy white leg warmers and white shoes, clean and minimal, large',
  },
  // ── 10차(2026-09-21 밤) — 선택 폼 2차 결과. 확정 = 복주머니·접힌 귀, 나머지 4부위 재생성 ─────────
  // 한복 무기: "달 또는 송편 컨셉의 무기"(9차 완드 3종은 채택 안 됨 → 완드가 아닌 무기 종류로).
  {
    key: 'chuseok_crescent_glaive',
    nameKo: '초승달 언월도',
    slot: 'weapon',
    batch: 10,
    concept: '한복 세트 무기 — 달',
    art:
      'a crescent-moon glaive — a long crimson lacquered shaft topped with a large sweeping golden crescent-moon blade, ' +
      'gold cloud engraving on the blade, a jade ring and a five-colored silk tassel below it, ' +
      'opulent and graceful, clearly a polearm glaive weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_songpyeon_spear',
    nameKo: '송편 꼬치 창',
    slot: 'weapon',
    batch: 10,
    concept: '한복 세트 무기 — 송편',
    art:
      'a festival spear — a long pale wooden shaft skewering three large plump half-moon songpyeon rice cakes in white, pale green and pink just below a gold spearhead, ' +
      'a sprig of green pine needles bound with a five-colored cord, ' +
      'festive and charming, clearly a spear weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_crescent_bow',
    nameKo: '초승달 활',
    slot: 'weapon',
    batch: 10,
    concept: '한복 세트 무기 — 달',
    art:
      'a crescent-moon bow — a recurve bow whose limbs form one slender golden crescent moon, a crimson silk-wrapped grip, a fine silver string, ' +
      'a small jade pendant with a five-colored tassel hanging from the lower tip, ' +
      'opulent and graceful, clearly a bow weapon, no text, large, diagonal',
  },
  // 한복 방어구: "금박 꽃무늬(v3)·옥색 저고리(v2)가 마음에 든다 — 비슷한 느낌으로 하나 더". 두 안의 레시피를 유지하고 색만 바꾼다.
  {
    key: 'chuseok_hanbok_v6',
    nameKo: '한복(옥색 저고리·금박 꽃무늬)',
    slot: 'armor',
    batch: 10,
    concept: '한복 세트 방어구 — v2의 옥색 + v3의 금박 꽃 띠',
    art:
      'a luxurious Korean hanbok — a pale jade silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing crimson chima skirt with a wide band of gold-leaf flower patterns along the hem, elegant and festive',
  },
  {
    key: 'chuseok_hanbok_v7',
    nameKo: '한복(노랑 저고리)',
    slot: 'armor',
    batch: 10,
    concept: '한복 세트 방어구 — 노랑 저고리 다홍 치마',
    art:
      'a luxurious Korean hanbok — a soft pale yellow silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing crimson chima skirt with a wide band of gold-leaf flower patterns along the hem, elegant and festive',
  },
  {
    key: 'chuseok_hanbok_v8',
    nameKo: '한복(남색 치마)',
    slot: 'armor',
    batch: 10,
    concept: '한복 세트 방어구 — 미색 저고리 남색 치마',
    art:
      'a luxurious Korean hanbok — a soft ivory silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing deep navy-blue chima skirt with a wide band of gold-leaf flower patterns along the hem, elegant and festive',
  },
  // 달토끼 무기: "떡메나 절굿공이 다 좋고 토끼도 좋은데 리본은 별로" → 끈·매듭 장식을 아예 쓰지 않는다(없는 것을 이름으로 부르지 않기).
  {
    key: 'chuseok_rabbit_mallet_v3',
    nameKo: '흰 떡메(토끼 얼굴)',
    slot: 'weapon',
    batch: 10,
    concept: '달토끼 세트 무기',
    art:
      'a simple rice-cake mallet — a large smooth round barrel head of pale white wood on a long slim plain handle, a small rabbit face stamped on the head, ' +
      'clean and minimal, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_pestle_v7',
    nameKo: '절굿공이(토끼 새김)',
    slot: 'weapon',
    batch: 10,
    concept: '달토끼 세트 무기',
    art:
      'a simple double-headed rice-cake pestle — a long pale white wooden pestle with two large bulbous rounded heads and a narrow smooth waist grip in the middle, ' +
      'a small rabbit silhouette engraved on one head, clean and minimal, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_mallet_ears',
    nameKo: '토끼 귀 떡메',
    slot: 'weapon',
    batch: 10,
    concept: '달토끼 세트 무기 — 메 머리가 토끼 모양',
    art:
      'a rice-cake mallet shaped like a rabbit — a large smooth round barrel head of pale white wood with two tall upright rabbit ears carved on top and a small rabbit face on the front, ' +
      'a long slim plain handle, clean and minimal, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  // 달토끼 방어구: "토끼 인형탈 느낌으로(머리 아래로만 전신슈트)". 머리·후드·가면 같은 말은 쓰지 않는다 —
  // 5·7차에서 그런 말이 들어가면 머리 윤곽이 그려졌다. 목둘레가 열린 한 벌 옷으로만 묘사한다.
  {
    key: 'chuseok_rabbit_suit',
    nameKo: '토끼 인형 슈트',
    slot: 'armor',
    batch: 10,
    concept: '달토끼 세트 방어구 — 전신 봉제 슈트',
    art:
      'a plush white rabbit costume bodysuit — a one-piece fluffy full-body suit with a round open neckline, a pale pink oval belly patch, ' +
      'rounded mitten paws, big padded feet with pink paw pads and a round cotton tail, soft and cuddly',
  },
  {
    key: 'chuseok_rabbit_suit_zip',
    nameKo: '토끼 인형 슈트(지퍼)',
    slot: 'armor',
    batch: 10,
    concept: '달토끼 세트 방어구 — 지퍼 달린 플리스 슈트',
    art:
      'a plush cream rabbit costume jumpsuit — a chubby one-piece full-body fleece suit with a front zipper and a round open neckline trimmed with soft white fur, ' +
      'short rounded arms ending in mitten paws, big oversized feet and a fluffy round tail, soft and cuddly',
  },
  {
    key: 'chuseok_rabbit_suit_round',
    nameKo: '토끼 인형 슈트(통통한 몸)',
    slot: 'armor',
    batch: 10,
    concept: '달토끼 세트 방어구 — 놀이공원 인형 옷 몸통',
    art:
      'a theme-park rabbit costume body — a rounded pear-shaped white plush full-body suit with a wide belly and a pink heart-shaped belly patch, ' +
      'a round open neckline, stubby arms with rounded paws, large flat feet and a pom-pom tail, cheerful and plump',
  },
  // ── 11차(09-22): 3차 선택 결과 ──────────────────────────────────────────────
  // 한복 무기: 10차 달·송편 무기 3종 미채택(사유 없음) → 아직 안 해 본 형태 셋(칼·둥근 부채·피리).
  {
    key: 'chuseok_moon_sword',
    nameKo: '달빛 환도',
    slot: 'weapon',
    batch: 11,
    concept: '한복 세트 무기 — 달',
    art:
      'a moonlit Korean hwando sword — a slender gently curved pale silver blade with a faint gold full-moon and cloud engraving, ' +
      'a golden crescent-moon shaped guard, a crimson silk-wrapped hilt, a jade ring and a five-colored silk tassel on the pommel, ' +
      'opulent and graceful, clearly a sword weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moon_roundfan',
    nameKo: '보름달 단선',
    slot: 'weapon',
    batch: 11,
    concept: '한복 세트 무기 — 달',
    art:
      'a round Korean silk hand fan — a large perfectly round fan face of pale gold silk painted with a glowing full moon and gold-leaf clouds, a thin gold rim, ' +
      'a slim crimson lacquered handle with a jade bead and a five-colored silk tassel, ' +
      'opulent and graceful, clearly a fan weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_moon_flute',
    nameKo: '달빛 옥피리',
    slot: 'weapon',
    batch: 11,
    concept: '한복 세트 무기 — 달',
    art:
      'a long Korean jade bamboo flute — a slender pale jade-green transverse flute with gold bands, a small golden crescent moon ornament near one end, ' +
      'a crimson cord with a five-colored silk tassel, ' +
      'opulent and graceful, clearly a flute staff weapon, no text, large, diagonal',
  },
  // 한복 방어구: "옥색 저고리(v2)의 치마 달무늬 + 금박 꽃무늬(v3)의 상의". v3 상의 문장 + v2 치마 문장을 그대로 잇는다.
  {
    key: 'chuseok_hanbok_v9',
    nameKo: '한복(미색 저고리·달무늬 치마)',
    slot: 'armor',
    batch: 11,
    concept: '한복 세트 방어구',
    art:
      'a luxurious Korean hanbok — a soft ivory silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing deep crimson chima skirt with gold-leaf moon and cloud patterns along the hem, elegant and festive',
  },
  {
    key: 'chuseok_hanbok_v10',
    nameKo: '한복(미색 저고리·달 변화 무늬)',
    slot: 'armor',
    batch: 11,
    concept: '한복 세트 방어구',
    art:
      'a luxurious Korean hanbok — a soft ivory silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing deep crimson chima skirt with a row of gold-leaf moon phases from crescent to full moon and small gold clouds along the hem, elegant and festive',
  },
  {
    key: 'chuseok_hanbok_v11',
    nameKo: '한복(미색 저고리·보름달 구름무늬)',
    slot: 'armor',
    batch: 11,
    concept: '한복 세트 방어구',
    art:
      'a luxurious Korean hanbok — a soft ivory silk jeogori jacket with a white collar, rainbow saekdong striped cuffs and a long crimson ribbon tie, ' +
      'a full-length flowing deep crimson chima skirt with gold-leaf full moons, crescent moons, stars and swirling clouds along the hem, elegant and festive',
  },
  // 달토끼 무기: "흰 떡메(9차 v2)에서 리본만 없는 느낌". 10차 v3는 정면·평면으로 나와 밋밋했다 →
  // v2 문장을 유지하고 입체(원통)·비스듬한 각도만 분명히 한다. 끈·매듭류 단어는 아예 쓰지 않는다.
  {
    key: 'chuseok_rabbit_mallet_v4',
    nameKo: '흰 떡메(리본 없음)',
    slot: 'weapon',
    batch: 11,
    concept: '달토끼 세트 무기',
    art:
      'a simple rice-cake mallet seen at a three-quarter angle — a large smooth round cylindrical barrel head of pale white wood on a long slim handle, a small rabbit face stamped on the side of the head, ' +
      'soft shading, clean and minimal, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_mallet_v5',
    nameKo: '흰 떡메(리본 없음 · 둥근 통)',
    slot: 'weapon',
    batch: 11,
    concept: '달토끼 세트 무기',
    art:
      'a simple rice-cake mallet — a large smooth round barrel head of pale white wood with visible round end caps, on a long slim handle of the same pale wood, a small rabbit face stamped on the head, ' +
      'three-dimensional with soft shading, clean and minimal, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_mallet_v6',
    nameKo: '흰 떡메(리본 없음 · 금테)',
    slot: 'weapon',
    batch: 11,
    concept: '달토끼 세트 무기',
    art:
      'a simple rice-cake mallet seen at a three-quarter angle — a large smooth round cylindrical barrel head of pale white wood with a thin gold band at each end, on a long slim handle, a small rabbit face stamped on the side of the head, ' +
      'soft shading, clean and refined, clearly a mallet hammer weapon, no text, large, diagonal',
  },
  // 달토끼 방어구: "토끼 인형 슈트가 괜찮은데 배는 그냥 흰색". 원본을 코드로 보정한 판(chuseok_rabbit_suit_white)이
  // 1순위이고, 아래는 비교용 새 그림 1장. 배 무늬 단어를 아예 쓰지 않는다.
  {
    key: 'chuseok_rabbit_suit_v2',
    nameKo: '토끼 인형 슈트(온통 흰색 · 새 그림)',
    slot: 'armor',
    batch: 11,
    concept: '달토끼 세트 방어구 — 전신 봉제 슈트',
    art:
      'a plush white rabbit costume bodysuit — a one-piece fluffy full-body suit in a single even snow-white color with a round open neckline, ' +
      'rounded mitten paws, big padded feet with pink paw pads and a round cotton tail, soft and cuddly',
  },
  // ── 12차(09-22): 4차 선택 결과. 달토끼 무기 = "절굿공이(토끼 얼굴, v2)에서 방울솔만 없는 느낌".
  // v2의 문장에서 방울솔 구절만 뺀다(없는 것을 이름 부르지 않음). 코드로 v2에서 방울솔을 지운 판이 1순위, 아래는 비교용.
  {
    key: 'chuseok_rabbit_pestle_v8',
    nameKo: '절굿공이(토끼 얼굴 · 방울솔 없음)',
    slot: 'weapon',
    batch: 12,
    concept: '달토끼 세트 무기',
    art:
      'a long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends and a slim waisted grip in the middle, ' +
      'a small rabbit face carved on one end, the grip neatly wrapped in pink and white silk cord, ' +
      'charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_pestle_v9',
    nameKo: '절굿공이(토끼 얼굴 · 방울솔 없음 · 2)',
    slot: 'weapon',
    batch: 12,
    concept: '달토끼 세트 무기',
    art:
      'a long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends and a slim waisted grip in the middle, ' +
      'a small rabbit face carved on one end and a tiny crescent moon carved on the other, the grip neatly wrapped in pink and white silk cord, ' +
      'charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  // 달토끼 방어구: 코드 보정판(흰 배)은 객체가 없어 애니메이션을 못 붙인다(사용자 09-22) → 원본 슈트 문장에서
  // 배 무늬 구절만 빼고 세 번 굴린다. 절굿공이도 보정판 대신 v8 문장으로 두 장 더.
  {
    key: 'chuseok_rabbit_suit_v3',
    nameKo: '토끼 인형 슈트(흰 배 · 새 그림 2)',
    slot: 'armor',
    batch: 12,
    concept: '달토끼 세트 방어구 — 전신 봉제 슈트',
    art:
      'a plush white rabbit costume bodysuit — a one-piece fluffy full-body suit with a round open neckline, ' +
      'rounded mitten paws, big padded feet with pink paw pads and a round cotton tail, soft and cuddly',
  },
  {
    key: 'chuseok_rabbit_suit_v4',
    nameKo: '토끼 인형 슈트(흰 배 · 새 그림 3)',
    slot: 'armor',
    batch: 12,
    concept: '달토끼 세트 방어구 — 전신 봉제 슈트',
    art:
      'a plush white rabbit costume bodysuit — a one-piece fluffy full-body suit with a round open neckline, plain white front, ' +
      'rounded mitten paws, big padded feet with pink paw pads and a round cotton tail, soft and cuddly',
  },
  {
    key: 'chuseok_rabbit_suit_v5',
    nameKo: '토끼 인형 슈트(흰 배 · 새 그림 4)',
    slot: 'armor',
    batch: 12,
    concept: '달토끼 세트 방어구 — 전신 봉제 슈트',
    art:
      'a plush white rabbit costume bodysuit — a one-piece fluffy full-body suit with a round open neckline, ' +
      'rounded mitten paws, big padded feet with pink paw pads and a round cotton tail, soft and cuddly, front view',
  },
  {
    key: 'chuseok_rabbit_pestle_v10',
    nameKo: '절굿공이(토끼 얼굴 · 방울솔 없음 · 3)',
    slot: 'weapon',
    batch: 12,
    concept: '달토끼 세트 무기',
    art:
      'a long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends and a slim waisted grip in the middle, ' +
      'a small rabbit face carved on one end, the grip neatly wrapped in pink and white silk cord, ' +
      'charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
  {
    key: 'chuseok_rabbit_pestle_v11',
    nameKo: '절굿공이(토끼 얼굴 · 방울솔 없음 · 4)',
    slot: 'weapon',
    batch: 12,
    concept: '달토끼 세트 무기',
    art:
      'a long rice-cake pestle — a tall pale polished wooden pestle with thick rounded ends and a slim waisted grip in the middle, ' +
      'a small rabbit face carved on one end, the grip wrapped in pink and white silk cord, ' +
      'charming and elegant, clearly a long pestle staff weapon, no text, large, diagonal',
  },
];

function promptOf(c: ChuseokCand): string {
  return buildArt({ key: c.key, slot: c.slot, art: c.art } as unknown as ItemV2);
}

/** 객체 id 즉시 기록 — 애니를 붙일 유일한 연결고리. 라벨 key3(gen-anim3가 이 키로 요청). */
function rememberedObject(itemKey: string): string {
  try {
    const m = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as Record<string, { key: string; objectId: string }>;
    return m[itemKey]?.key === LABEL ? (m[itemKey].objectId ?? '') : '';
  } catch {
    return '';
  }
}

function rememberObject(itemKey: string, objectId: string): void {
  let m: Record<string, { key: string; objectId: string }> = {};
  try {
    if (existsSync(MAP_PATH)) m = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  } catch {
    m = {};
  }
  m[itemKey] = { key: LABEL, objectId };
  writeFileSync(MAP_PATH, JSON.stringify(m, null, 2) + '\n');
}

function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const u = pickUrl(x);
      if (u) return u;
    }
  }
  return null;
}

async function genOne(c: ChuseokCand, key: string): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(OUT_DIR, `${c.key}.png`);
  if (existsSync(out)) return 'skip';
  // 생성은 됐는데 내려받다 끊긴 경우(ECONNRESET 등) — 기록된 객체 id로 결과만 다시 받는다.
  // 없으면 같은 그림을 한 번 더 만들어 비용이 두 번 든다(2026-09-22 11차에서 실제 발생).
  let objectId = rememberedObject(c.key);
  if (objectId) console.log(`  ${c.key} 기록된 객체 재사용(생성 요청 없음)`);
  for (let attempt = 0; attempt < 5 && !objectId; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PIX}/create-1-direction-object`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ description: promptOf(c), size: SIZE, view: 'sidescroller' }),
      });
    } catch (e) {
      console.error(`  ${c.key} 네트워크 — 재시도: ${(e as Error).message}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) {
      await sleep(3000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      console.error(`  ${c.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return 'fail';
    }
    const j = (await res.json()) as { object_id?: string };
    objectId = j.object_id ?? '';
    if (objectId) rememberObject(c.key, objectId);
    break;
  }
  if (!objectId) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try {
      g = await fetch(`${PIX}/objects/${objectId}`, { headers: { authorization: `Bearer ${key}` } });
    } catch {
      continue;
    }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) return 'fail';
      let buf: Buffer | null = null;
      for (let d = 0; d < 4 && !buf; d++) {
        try {
          buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        } catch (e) {
          console.error(`  ${c.key} 내려받기 — 재시도: ${(e as Error).message}`);
          await sleep(1500 * 2 ** d);
        }
      }
      if (!buf || buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
      writeFileSync(out, buf);
      return 'ok';
    }
    if (gj.status === 'failed') return 'fail';
  }
  console.error(`  ${c.key} 폴링 타임아웃(객체 id 기록됨: ${objectId})`);
  return 'fail';
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const list = only ? CANDIDATES.filter((c) => only.includes(c.key)) : CANDIDATES;
  if (process.argv.includes('--dry')) {
    for (const c of list) console.log(`[${c.slot}] ${c.key} ${c.nameKo}\n  ${promptOf(c)}\n`);
    return;
  }
  const { key, envName } = scriptKeyFor(LABEL);
  if (!key) {
    console.error(`${envName} 필요 — .env.local`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`추석 후보 ${list.length}종 — Pixellab 객체(sidescroller, ${SIZE}px, ${LABEL})\n`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const c of list) {
    const r = await genOne(c, key); // 동시성 1 — 429 회피(파이프라인 관례)
    if (r === 'ok') ok += 1;
    else if (r === 'skip') skip += 1;
    else fail += 1;
    console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} [${c.slot}] ${c.key.padEnd(28)} ${c.nameKo}`);
  }
  console.log(`\n완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

// 직접 실행할 때만 생성한다 — 검토 페이지 빌더가 CANDIDATES만 가져다 쓸 때 유료 호출이 나가지 않게.
if (process.argv[1]?.endsWith('gen-chuseok-cand.ts')) void main();
