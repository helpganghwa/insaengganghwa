// 신규 120종 아바타-코디 카탈로그 작업 데이터(docs/ITEMS.md). 배치 단위로 채워 나간다.
// 워크플로: ①컨셉·이름·프롬프트 검수 → ②이미지(객체) 생성·검수 → ③이미지 보고 로어 작성.
// 프롬프트 원칙(memory pixellab-item-prompt-balance):
//   - 최대한 디테일·특색(아이템마다 애정 생기게). 형태/구성 디테일 자세히.
//   - 지역이 왕국이어도 '로열+보석'으로 도배 금지 — 아이템마다 재질·역할·캐릭터를 제각각.
//     보석은 그게 진짜 컨셉인 것만. 화려함은 다양한 장인적 재질(강철·실크·라커·호두나무·은각인 등)로.
//   - 무기: large·diagonal·clean/straight(가드는 칼날에 수직), 두꺼운 타입 적극.
export type ItemV2 = {
  key: string;
  slot: 'weapon' | 'armor' | 'accessory';
  nameKo: string;
  region: string;
  tone: string;
  concept: string;
  art: string; // 컨셉-온리 프롬프트 조각 "a <종류> — <역할·무드>"(외형묘사 X). buildArt가 품질 tail을 덧붙임.
  wornDesc: string;
  lore: string;
  keeper?: boolean; // 사용자가 고른 확정 이미지(생성 스킵·잠금)
};

import { EXTRA_ITEMS } from './items-extra';
import { WEAPONS_90, ARMOR_90, ACCESSORIES_90 } from './items90';

const INLINE_ITEMS: ItemV2[] = [
  // ── 왕국 · 무기 (10) · 아이템마다 다른 재질·캐릭터 ───────────────────────────
  {
    key: 'kingdom_ribbon_rapier',
    slot: 'weapon',
    nameKo: '푸른 매듭',
    region: '왕국',
    tone: '화려',
    concept: '파란 실크 리본의 결투용 레이피어',
    art: 'an ornate royal rapier with a flowing ribbon, elegant and splendid, large, pixel art',
    wornDesc: 'a slim golden rapier with an ornate guard and a trailing blue ribbon',
    lore: '',
  },
  {
    key: 'kingdom_coronation_greatsword',
    slot: 'weapon',
    nameKo: '왕관의 무게',
    region: '왕국',
    tone: '영웅담',
    concept: '크라운 폼멜의 묵직한 강철 대검',
    art: 'a grand ornate royal two-handed greatsword, majestic and splendid, premium game-art, isolated object, plain background, large, pixel art',
    wornDesc: 'a magnificent heroic greatsword with a broad gleaming steel blade and a golden crown-shaped pommel, rested over one shoulder',
    lore: '',
  },
  {
    key: 'kingdom_court_twinblades',
    slot: 'weapon',
    nameKo: '마주 든 한 쌍',
    region: '왕국',
    tone: '화려',
    concept: 'X자 교차·자개 라커 손잡이 쌍곡검',
    art: 'two slim curved court sabers crossed in a big X shape, black lacquered hilts inlaid with mother-of-pearl and hanging silk tassels, lavishly ornate in a fantasy anime style, graceful and exotic, isolated object, plain background, large, pixel art',
    wornDesc: 'a pair of slim curved sabers with black lacquered, pearl-inlaid hilts, one per hand',
    lore: '',
  },
  {
    key: 'kingdom_coronation_spear',
    slot: 'weapon',
    nameKo: '즉위를 알린 창',
    region: '왕국',
    tone: '영웅담',
    concept: '긴 물푸레 자루에 왕실 깃발 단 의장창',
    art: 'a very long slender processional spear, a tall finely polished shaft with gold fittings, a gleaming steel head, a rich royal banner streaming from below the blade, ceremonial and majestic, full length, pixel art',
    wornDesc: 'a long processional spear with a pale wooden shaft, a steel head and a royal banner below the blade',
    lore: '',
  },
  {
    key: 'kingdom_jewel_longsword',
    slot: 'weapon',
    nameKo: '보석을 삼킨 날',
    region: '왕국',
    tone: '화려',
    concept: '자수정이 박힌 넓은 의장 장검(보석이 컨셉)',
    art: 'a magnificent fantasy longsword, a broad ornate blade set with a glittering row of amethyst gems, an elaborate gilded guard and a large amethyst gem pommel, lavishly jeweled in a fantasy anime JRPG style, gorgeous and splendid, clean and straight with the guard perpendicular to the blade, large, pixel art',
    wornDesc: 'a broad longsword with a row of amethyst gems along the blade and a gilded hilt',
    lore: '',
  },
  {
    key: 'kingdom_guard_halberd',
    slot: 'weapon',
    nameKo: '문 앞의 맹세',
    region: '왕국',
    tone: '영웅담',
    concept: '왕실 정문을 지키는 화려한 의장 할버드',
    art: 'a magnificent fantasy royal halberd, a long ornate shaft with a large gold-engraved axe blade and a spike, lavishly ornate in a fantasy anime style, splendid and grand, isolated object, plain background, full length, pixel art',
    wornDesc: 'an ornate royal halberd with a long shaft and a large gold-engraved axe blade',
    lore: '',
  },
  {
    key: 'kingdom_cane_sword',
    slot: 'weapon',
    nameKo: '지팡이 속 한 줄',
    region: '왕국',
    tone: '수수께끼',
    concept: '호두나무·놋쇠 손잡이 지팡이검',
    art: "an exquisite fantasy gentleman's cane, lustrous dark wood with elaborate gold scrollwork and a jeweled bird-head handle, concealing a thin hidden blade, luxurious in a fantasy anime style, refined and splendid, large, pixel art",
    wornDesc: 'a polished dark-walnut cane with a brass bird-head handle that conceals a thin blade',
    lore: '',
  },
  {
    key: 'kingdom_duel_pistol',
    slot: 'weapon',
    nameKo: '정중한 한 발',
    region: '왕국',
    tone: '화려',
    concept: '은각인 호두나무 플린트락 결투 권총',
    art: 'an exquisite flintlock dueling pistol, a fine dark walnut stock with chased silver scrollwork and gold inlay, a long engraved barrel, refined and elegant, large, pixel art',
    wornDesc: 'an antique flintlock dueling pistol with a dark walnut stock and chased silver scrollwork',
    lore: '',
  },
  {
    key: 'kingdom_scepter_mace',
    slot: 'weapon',
    nameKo: '보석을 인 홀',
    region: '왕국',
    tone: '전설',
    concept: '거대한 루비가 얹힌 황금 왕홀(보석이 컨셉)',
    art: 'a golden royal scepter-mace crowned with one enormous ruby, ornate gold flanges, lavishly regal and gorgeous, large, pixel art',
    wornDesc: 'an ornate golden scepter-mace topped with one enormous ruby',
    lore: '',
  },
  {
    key: 'kingdom_ribbon_whip',
    slot: 'weapon',
    nameKo: '풀린 리본의 춤',
    region: '왕국',
    tone: '아름다운',
    concept: '강철 비늘 박힌 크림슨 실크 리본 채찍',
    art: 'a long flowing ribbon-whip of crimson silk lined with tiny steel scales, an ornate grip, graceful and beautiful, large, pixel art',
    wornDesc: 'a long crimson silk ribbon-whip lined with tiny steel scales and an ornate grip',
    lore: '',
  },

  // ── 새 방식(종류+컨셉+스타일) 테스트 — 신전·늪지 ──────────────────────────
  {
    key: 'temple_frostvein_rifle',
    slot: 'weapon',
    nameKo: '첫눈을 겨눈 총신',
    region: '신전',
    tone: '영웅담',
    concept: '성스러운 설산 사냥꾼의 의식용 장총',
    art: 'a long fantasy flintlock musket (a snow-temple hunter who aims at the first snowfall) — a splendid, gorgeous, lavishly detailed premium visual pixel-art game item, dazzling frost-touched fantasy game art, no telescopic scope, isolated object, plain background, large, pixel art',
    wornDesc: 'a long ornate hunting rifle, white-silver with frost-rune accents and fur trim, held one-handed at rest',
    lore: '',
  },
  {
    key: 'swamp_petal_dress',
    slot: 'armor',
    nameKo: '요정의 첫 꽃잎',
    region: '늪지대',
    tone: '아름다운',
    concept: '어린 늪요정의 첫 비행 꽃잎 드레스',
    art: 'a layered petal fairy dress — the first-flight gown of a young bog-fairy, woven from dawn-dewed flower petals with gossamer wings, light and joyful — drawn in a cute charming fantasy-anime style, soft luminous pastel pink and mint, a graceful slender silhouette, isolated object, plain background, pixel art',
    wornDesc: 'a layered pastel-pink-and-mint petal fairy dress with sheer gossamer wings',
    lore: '',
  },
];

// 재설계: 새 90종(items90)을 카탈로그로 사용. 이전 120종은 보류 — 삭제하지 않고
// HELD_ITEMS로 보존(나머지 30을 여기서 골라 추가할 풀). 현재 무기 30만 작성됨(방어구·장신구 추가 예정).
export const HELD_ITEMS: ItemV2[] = [...INLINE_ITEMS, ...EXTRA_ITEMS];
export const ITEMS_V2: ItemV2[] = [...WEAPONS_90, ...ARMOR_90, ...ACCESSORIES_90];

// 컨셉-온리 확정 방식(2026-06-27): art = "a <종류> — <역할·무드>"(외형묘사 X). buildArt가 슬롯별 품질 tail만 덧붙임.
// 자유를 줄수록 결과가 좋다(사용자 검증). 아바타가 일본 애니메 미소년/미소녀라 톤은 밝고 깔끔한 애니/JRPG.
const TAIL: Record<string, string> = {
  weapon: 'a beautiful clean fantasy anime RPG gacha-game weapon, bright and stylish, not gothic, a single isolated object on a plain flat empty background, large, pixel art',
  armor: 'a beautiful clean fantasy anime RPG gacha-game outfit, bright and stylish, not gothic, shown as the worn outfit on its own with no head and no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  accessory: 'a beautiful clean fantasy anime RPG gacha-game item, bright and stylish, not gothic, a single isolated object on a plain flat empty background, pixel art',
};
export function buildArt(it: ItemV2): string {
  if (it.art.includes('pixel art')) return it.art; // 이미 완성된 프롬프트면 그대로
  return `${it.art}, ${TAIL[it.slot] ?? TAIL.accessory}`;
}
