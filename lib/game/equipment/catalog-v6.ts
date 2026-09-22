import type { CatalogItem } from './catalog';

/**
 * 6차 편성(2026-09-22) — 한가위 6종(docs/CHUSEOK.md). 슬롯당 2종을 더해 40 → 42(아이템당 보급 확률 2.5% → 약 2.38%).
 *
 * 두 벌로 나뉜다 — 한복(달그림자 완드·달구름 옥색 한복·한가위 복주머니)과 달토끼(달빛 절굿공이·보송한 토끼
 * 인형 옷·접힌 토끼 귀 머리띠). 한가위 강화 대회 칭호가 벌마다 붙는다(신월·반월·만월 / 매화·작약·모란).
 * 지역은 '일반'(파견 시너지·필터·위키 문구를 건드리지 않는다). 그림은 scripts/gen-chuseok-cand.ts로 뽑아
 * 선택 폼에서 고른 것(scripts/build-chuseok-pick.ts). 등급·성능 없음(GDD §3.1).
 *
 * ⚠ DB 행은 seed-catalog가 active=false로 넣고, 9/24 00:00(KST)에 예약 발행 크론(lib/game/chuseok/open.ts)이 켠다 —
 *   확률 공시(§33)는 그 24시간 전에 나간다. 켜기 전엔 보급 풀·도감·확률 공시에 나오지 않는다.
 */
export const CATALOG_V6: CatalogItem[] = [
  {
    key: 'chuseok_moon_wand',
    slot: 'weapon',
    nameKo: '달그림자 완드',
    region: '일반',
    tone: '수수께끼',
    lore: '금빛 보름달 하나를 구름 테에 끼워 자루에 얹었다. 달 속에는 절구를 찧는 토끼 그림자가 있는데, 자루를 기울이면 그림자가 조금 앞서 움직인다고 한다. 오색 술이 달릴수록 그림자가 또렷해진다는 말은 아직 아무도 확인하지 못했다.',
    art: 'a short wand topped with a large glowing golden full moon disc showing a dark rabbit-pounding-mortar silhouette, a thin gold cloud rim around the moon, dark wooden handle with five-colored silk tassels, pixel art',
    wornDesc: 'a short wand held in one hand, topped with a round glowing golden full-moon disc that shows a small dark rabbit silhouette, a thin gold cloud rim around the disc, colorful silk tassels hanging from the dark handle',
  },
  {
    key: 'chuseok_rabbit_pestle',
    slot: 'weapon',
    nameKo: '달빛 절굿공이',
    region: '일반',
    tone: '위트',
    lore: '매끈하게 다듬은 흰 나무 절굿공이다. 손잡이에는 실 한 가닥 감지 않았는데, 잡아 보면 어디를 쥐어야 하는지 손이 먼저 안다. 달에서 떡을 찧던 것을 누가 빌려 왔다는데, 돌려주지 않아도 달은 아직 아무 말이 없다.',
    art: 'a smooth polished pale wooden pestle held diagonally, thick rounded head and plain smooth grip with no wrapping, soft moonlight sheen, pixel art',
    wornDesc: 'a long smooth pale wooden pestle held in one hand like a club, thick rounded head, plain unwrapped grip',
  },
  {
    key: 'chuseok_jade_hanbok',
    slot: 'armor',
    nameKo: '달구름 옥색 한복',
    region: '일반',
    tone: '아름다운',
    lore: '옥색 저고리에 진홍 치마를 받쳐 입고, 치마 자락에는 금박으로 달과 구름을 찍었다. 걸을 때마다 구름이 달을 스치는 것처럼 보여, 한가위 밤에 마당을 돌면 달이 둘이라는 말을 듣는다.',
    art: 'a Korean hanbok with a pale jade-green jeogori jacket and a deep crimson full chima skirt printed with gold-leaf moon and cloud patterns, multicolored striped sleeves, elegant, pixel art',
    wornDesc: 'a Korean hanbok: a pale jade-green short jacket with multicolored striped sleeves over a long full deep-crimson skirt printed with gold moon and cloud patterns',
    wornDescMale: 'a Korean hanbok for men: a pale jade-green jacket with multicolored striped sleeves and a long deep-crimson overcoat printed with gold moon and cloud patterns',
  },
  {
    key: 'chuseok_rabbit_suit',
    slot: 'armor',
    nameKo: '보송한 토끼 인형 옷',
    region: '일반',
    tone: '희망',
    lore: '온통 흰 털로 지은 한 벌짜리 옷이다. 손목과 발목에 복슬한 털 깃이 있고 발바닥은 분홍이다. 입으면 발소리가 나지 않아, 명절 아침 부엌에 몰래 들어가 송편 하나를 집어 오기에 이보다 좋은 옷이 없다.',
    art: 'a plush white full-body rabbit costume suit with a round open neckline, fluffy fur cuffs at wrists and ankles, big padded feet with pink paw pads, a fluffy round cotton tail, soft and cuddly, pixel art',
    wornDesc: 'a plush white one-piece rabbit costume suit covering the body, fluffy fur cuffs at the wrists and ankles, big soft padded feet with pink pads, a round white cotton tail',
  },
  {
    key: 'chuseok_bok_pouch',
    slot: 'accessory',
    nameKo: '한가위 복주머니',
    region: '일반',
    tone: '희망',
    lore: '진홍 비단에 금실로 복 자를 수놓은 주머니다. 매듭을 풀면 안에는 아무것도 없는데, 그래서 넣을 자리가 늘 남아 있다. 명절에 받은 좋은 말을 하나씩 넣어 두면 이듬해까지 든든하다고 한다.',
    art: 'a small Korean bok-jumeoni lucky pouch of deep crimson silk embroidered with a gold character and floral patterns, tied with a colorful silk knot and tassel, pixel art',
    wornDesc: 'a small deep-crimson silk lucky pouch embroidered in gold, tied with a colorful silk knot and tassel, hanging at the waist',
  },
  {
    key: 'chuseok_rabbit_ears',
    slot: 'accessory',
    nameKo: '접힌 토끼 귀 머리띠',
    region: '일반',
    tone: '위트',
    lore: '흰 털 귀 두 짝이 달린 머리띠인데, 한쪽 귀가 늘 접혀 있다. 세워 놓아도 이튿날이면 다시 접혀 있어서, 이제는 누구도 세우려 들지 않는다. 접힌 쪽으로 들으면 먼 데 절구 소리가 들린다는 아이들 말이 있다.',
    art: 'a white plush rabbit-ear headband with one ear standing and one ear folded over, pink inner ears, soft fur texture, pixel art',
    wornDesc: 'a white plush rabbit-ear headband worn on the head, one ear standing up and the other folded over, pink inner ears',
  },
];

/** 한가위 6종의 code — seed-catalog는 이 code를 active=false로 넣고, 개방(9/24 00:00)은 lib/game/chuseok/open.ts가 한다. */
export const CHUSEOK_ITEM_KEYS: readonly string[] = CATALOG_V6.map((c) => c.key);
