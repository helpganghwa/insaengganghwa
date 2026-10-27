import type { CatalogItem } from './catalog';

/**
 * 7차 편성(2026-10) — 할로윈 6종(docs/HALLOWEEN.md). 슬롯당 2종을 더해 42 → 44(아이템당 보급 확률 약 2.38% → 약 2.27%).
 *
 * ⚠ 2026-10-25 현재 **임시(더미)** — 스테이징에서 이벤트 흐름을 먼저 검증하려고 2차 후보(scripts/gen-halloween-cand.ts의
 *   hw2_smith_*·hw2_ghost_*) 그림·이름으로 채웠다. 세트가 확정되면 code·이름·로어·그림을 정본으로 바꾸고
 *   lib/game/halloween/config.ts의 HALLOWEEN_CONTEST_ITEMS도 함께 고친다(프로덕션 시드 전에).
 * 지역은 '일반'(파견 시너지·필터·위키 문구를 건드리지 않는다). 등급·성능 없음(GDD §3.1).
 *
 * ⚠ DB 행은 seed-catalog가 active=false로 넣고, 10/28 12:00(KST)에 예약 발행 크론(lib/game/halloween/open.ts)이 켠다 —
 *   확률 공시(§33)는 그 24시간 전에 나간다. 노출·추첨은 서버 시각 게이트(halloweenItemsOpen).
 */
export const CATALOG_V7: CatalogItem[] = [
  {
    key: 'halloween_smith_hammer',
    slot: 'weapon',
    nameKo: '말하는 담금망치',
    region: '일반',
    tone: '위트',
    lore: '(임시) 무쇠 머리에 부리부리한 눈과 콧수염이 달린 망치다. 내리칠 때마다 무어라 투덜거리는데, 불똥이 튀는 소리에 묻혀 끝까지 들은 사람은 없다.',
    art: 'a sturdy blacksmith forging hammer whose dark iron head has a grumpy cartoon face with a thick curled mustache, one end glowing orange-hot, a worn wooden handle wrapped in leather, pixel art',
    wornDesc: 'a sturdy blacksmith hammer held in one hand, its dark iron head shaped with a grumpy cartoon face and a curled mustache, a leather-wrapped wooden handle',
  },
  {
    key: 'halloween_smith_apron',
    slot: 'armor',
    nameKo: '손때 묻은 가죽 앞치마',
    region: '일반',
    tone: '희망',
    lore: '(임시) 그을린 자국과 손때가 겹겹이 앉은 대장장이의 가죽 앞치마다. 주머니마다 작은 연장이 꽂혀 있고, 하나도 같은 모양이 없다.',
    art: 'a well-worn brown leather blacksmith apron with scorch marks, small tools tucked into front pockets, over a rolled-sleeve linen shirt, pixel art',
    wornDesc: 'a well-worn brown leather blacksmith apron with scorch marks and small tools in its front pockets, over a rolled-sleeve cream linen shirt and dark trousers',
  },
  {
    key: 'halloween_smith_scarf',
    slot: 'accessory',
    nameKo: '불똥 막이 두건',
    region: '일반',
    tone: '위트',
    lore: '(임시) 불똥이 머리카락에 붙지 않게 질끈 동여매는 두건이다. 매듭을 너무 세게 묶은 탓에 끝자락이 늘 토끼 귀처럼 솟아 있다.',
    art: 'a red cloth bandana headscarf tied at the back with the knot ends sticking up, a few tiny ember burn spots, pixel art',
    wornDesc: 'a red cloth bandana headscarf tied over the head, the knot ends sticking up at the back',
  },
  {
    key: 'halloween_ghost_basket',
    slot: 'weapon',
    nameKo: '사탕 가득 호박 바구니',
    region: '일반',
    tone: '희망',
    lore: '(임시) 웃는 얼굴을 새긴 호박 바구니에 사탕이 넘칠 듯 담겨 있다. 문을 두드릴 때마다 조금씩 무거워진다.',
    art: 'a carved jack-o-lantern candy basket with a smiling face and a curved handle, overflowing with colorful wrapped candies, pixel art',
    wornDesc: 'a carved smiling jack-o-lantern candy basket held by its handle in one hand, overflowing with colorful wrapped candies',
  },
  {
    key: 'halloween_ghost_sheet',
    slot: 'armor',
    nameKo: '바닥에 끌리는 홑청 망토',
    region: '일반',
    tone: '위트',
    lore: '(임시) 이불 홑청을 통째로 뒤집어쓴 유령 분장이다. 너무 길어서 걸을 때마다 밑단을 밟는데, 그 덕에 유령치고는 발소리가 요란하다.',
    art: 'a long white bedsheet ghost costume cloak that drags on the floor, soft folds, a slightly frayed hem, cute and festive, pixel art',
    wornDesc: 'a long white bedsheet ghost costume draped over the shoulders like a cloak, dragging on the floor in soft folds',
  },
  {
    key: 'halloween_ghost_mask',
    slot: 'accessory',
    nameKo: '눈구멍 뚫린 유령 가면',
    region: '일반',
    tone: '위트',
    lore: '(임시) 동그란 눈구멍 두 개를 뚫은 흰 천 가면이다. 눈구멍 위치가 조금 어긋나 있어, 쓰면 늘 놀란 표정이 된다.',
    art: 'a simple white cloth ghost mask with two round black eye holes and a small round mouth, cute and festive, pixel art',
    wornDesc: 'a simple white cloth ghost mask over the upper face with two round eye holes',
  },
];

/** 할로윈 6종의 code — seed-catalog는 이 code를 active=false로 넣고, 개방(10/28 12:00)은 lib/game/halloween/open.ts가 한다. */
export const HALLOWEEN_ITEM_KEYS: readonly string[] = CATALOG_V7.map((c) => c.key);
