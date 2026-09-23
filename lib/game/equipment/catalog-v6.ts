import type { CatalogItem } from './catalog';

/**
 * 6차 편성(2026-09-22) — 한가위 6종(docs/CHUSEOK.md). 슬롯당 2종을 더해 40 → 42(아이템당 보급 확률 2.5% → 약 2.38%).
 *
 * 두 벌로 나뉜다 — 한복(달그림자 완드·금박 꽃단 한복·한가위 복주머니)과 달토끼(보름달 떡메·토끼 인형 옷·접힌 토끼 귀 머리띠). 한가위 강화 대회 칭호가 벌마다 붙는다(신월·반월·만월 / 매화·작약·모란).
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
    lore: '금빛 보름달 하나를 구름 테에 끼워 자루 끝에 얹었다. 오색 술이 흔들릴 때마다 달빛이 술 끝까지 흘러내린다. 하늘의 달은 한 달에 한 번만 차지만, 이 달은 자루를 쥔 손이 놓지 않는 한 늘 가득 차 있다.',
    art: 'a short wand topped with a large glowing golden full moon disc showing a dark rabbit-pounding-mortar silhouette, a thin gold cloud rim around the moon, dark wooden handle with five-colored silk tassels, pixel art',
    wornDesc: 'a short wand held in one hand, topped with a round glowing golden full-moon disc that shows a small dark rabbit silhouette, a thin gold cloud rim around the disc, colorful silk tassels hanging from the dark handle',
  },
  {
    key: 'chuseok_rabbit_pestle',
    slot: 'weapon',
    nameKo: '보름달 떡메',
    region: '일반',
    tone: '위트',
    lore: '네모난 나무 머리에 보름달과 그 앞에 선 토끼를 새겼다. 자루에는 붉은 끈을 감고 술을 달았다. 달에서 떡을 찧던 그 떡메라는 말이 있는데, 확인할 길은 없다. 다만 내리치면 소리가 유난히 멀리, 달까지 닿을 듯이 울린다.',
    art: 'a large pale wooden rice-cake mallet with a squared barrel head carved with a white moon rabbit before a golden full moon, a long wooden handle wrapped in red cord with small red tassels, pixel art',
    wornDesc: 'a large pale wooden rice-cake mallet held in one hand: a big squared wooden barrel head set crosswise on the end of a long straight wooden handle, the flat side of the head carved with a white rabbit standing before a golden full moon, the lower half of the handle wrapped in red cord with two small red tassels hanging from it',
  },
  {
    key: 'chuseok_jade_hanbok',
    slot: 'armor',
    nameKo: '금박 꽃단 한복',
    region: '일반',
    tone: '아름다운',
    lore: '미색 저고리에 진홍 옷고름을 길게 늘이고, 색동 소매 아래로 진홍 치마가 넓게 퍼진다. 치맛단에는 금박으로 꽃을 한 줄 둘렀다. 걸을 때마다 단이 흔들려 꽃이 피었다 지는데, 멈춰 서면 한꺼번에 만개한다.',
    art: 'a Korean hanbok with an ivory jeogori jacket, a long crimson goreum ribbon, multicolored striped sleeves, and a deep crimson full chima skirt with a gold-leaf floral band along the hem, elegant, pixel art',
    wornDesc: 'a Korean hanbok: an ivory short jacket with multicolored striped sleeves and a long crimson ribbon tie, over a long full deep-crimson skirt with a gold floral band along the hem',
    wornDescMale: 'Men\'s Hanbok, Korean traditional men\'s clothing, every piece of it hanbok, with a short upper body and long trousers: a hanbok jeogori, an ivory hip-length jacket with a white collar band, its front closed by a crimson goreum, the hanbok\'s wide flat ribbon tied in a single loop at the chest with two long tails hanging straight down, multicolored striped cuffs at the sleeve ends; over the jacket a hanbok baeja, a deep-crimson sleeveless hip-length vest with a gold floral band along its hem; hanbok baji, wide loose deep-crimson trousers with the legs fully visible from hip to ankle, gathered and tied at the ankles with cloth cords; flat black traditional hanbok cloth shoes',
  },
  {
    key: 'chuseok_rabbit_suit',
    slot: 'armor',
    nameKo: '토끼 인형 옷',
    region: '일반',
    tone: '희망',
    lore: '온통 흰 털로 지은 한 벌짜리 옷이다. 손목과 발목에 복슬한 털 깃이 있고 발바닥은 분홍이다. 입으면 발소리가 사라지고 몸이 조금 가벼워진다. 달까지 뛰어오를 만큼은 아니지만, 그래도 어제보다는 한 뼘 높이 뛴다.',
    art: 'a plush white full-body rabbit costume suit with a round open neckline, fluffy fur cuffs at wrists and ankles, big padded feet with pink paw pads, a fluffy round cotton tail, soft and cuddly, pixel art',
    wornDesc: 'a loose, baggy, oversized white plush rabbit kigurumi onesie several sizes too big, covering the whole body from the neck down to the paws in one piece, thick padded fluffy fur hanging in slack folds that completely hides the body shape, the arms and legs wide padded tubes of fur, big round mitten paws with pink pads in place of hands, big soft padded paw feet with pink pads, a round white cotton tail',
  },
  {
    key: 'chuseok_bok_pouch',
    slot: 'accessory',
    nameKo: '복주머니',
    region: '일반',
    tone: '희망',
    lore: '진홍 비단에 금실 자수, 오색 매듭과 술이 달린 주머니다. 복이 든다는 말에 다들 한 번씩 열어 보지만 안은 늘 비어 있다. 그런데 열어 본 사람치고 그날 밤 잠을 설친 이가 없다. 복이란 원래 눈에 안 보이는 법이라며, 주머니는 다시 매듭을 짓는다.',
    art: 'a small Korean bok-jumeoni lucky pouch of deep crimson silk embroidered with a gold character and floral patterns, tied with a colorful silk knot and tassel, pixel art',
    wornDesc: 'a small deep-crimson silk lucky pouch embroidered in gold, tied with a colorful silk knot and tassel, hanging at the waist',
  },
  {
    key: 'chuseok_rabbit_ears',
    slot: 'accessory',
    nameKo: '접힌 토끼 귀 머리띠',
    region: '일반',
    tone: '위트',
    lore: '흰 털 귀 두 짝이 달린 머리띠인데, 한쪽 귀가 늘 접혀 있다. 재미있는 이야기를 들으면 접힌 귀가 슬며시 펴졌다가, 이야기가 끝나면 도로 접힌다. 그래서 이 머리띠를 쓴 사람 앞에서는 다들 조금 더 재미있게 말하려 든다.',
    art: 'a white plush rabbit-ear headband with one ear standing and one ear folded over, pink inner ears, soft fur texture, pixel art',
    wornDesc: 'a white plush rabbit-ear headband worn on the head, one ear standing up and the other folded over, pink inner ears',
  },
];

/** 한가위 6종의 code — seed-catalog는 이 code를 active=false로 넣고, 개방(9/24 00:00)은 lib/game/chuseok/open.ts가 한다. */
export const CHUSEOK_ITEM_KEYS: readonly string[] = CATALOG_V6.map((c) => c.key);
