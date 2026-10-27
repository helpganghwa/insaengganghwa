import type { CatalogItem } from './catalog';

/**
 * 7차 편성(2026-10) — 할로윈 6종(docs/HALLOWEEN.md). 슬롯당 2종을 더해 42 → 44(아이템당 보급 확률 약 2.38% → 약 2.27%).
 *
 * 2026-10-27 확정 — 대장장이(망치·앞치마·두건)·꼬마 뱀파이어(양산·망토·실크햇). 그림·애니는 scripts/gen-halloween-cand.ts 후보
 *   (hw2_smith_hammer·hw5_smith_apron·hw9_smith_kerchief·hw9_vamp_parasol·hw5_vamp_cape·hw7_vamp_tophat)에서 왔다(catalog-v3-codemap).
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
    lore: '무쇠 머리에 굵은 눈썹과 말린 콧수염이 붙은 담금망치다. 한쪽 끝은 늘 벌겋게 달아 있고, 입은 무언가를 외치듯 벌어져 있다. 내리칠 때마다 잔소리를 쏟아 내는데, 들어 보면 대개 옳은 말이라 더 얄밉다.',
    art: 'a sturdy blacksmith forging hammer whose dark iron head has a grumpy cartoon face: big glaring eyes, bushy eyebrows, a thick curled mustache and an open shouting mouth, one end of the head glowing orange-hot with tiny sparks, a worn wooden handle wrapped in leather, funny and charming, clearly a hammer weapon, no text, large, diagonal',
    wornDesc: 'a big blacksmith sledgehammer with a heavy dark iron head that has a grumpy face with bushy curled eyebrows, a curled mustache and an open shouting mouth, one striking end glowing red-hot orange with flying sparks, a thick wooden handle wrapped in brown leather with iron bands',
  },
  {
    key: 'halloween_smith_apron',
    slot: 'armor',
    nameKo: '장인의 앞치마',
    region: '일반',
    tone: '영웅담',
    lore: '두꺼운 가죽 앞치마의 가슴판에 모루 문양을 찍었다. 어깨끈은 등에서 엇갈려 놋쇠 버클로 여민다. 앞주머니에는 집게와 정, 줄이 꽂혀 있다. 그을린 밑단과 덧댄 천 조각은 하나하나가 불 앞에서 보낸 날들이다.',
    art: 'a richly detailed brown leather master blacksmith\'s apron on its own, from chest to knees, layered patched leather panels with decorative stitching and brass rivets, an embossed hammer-and-anvil emblem on the chest, several front pockets holding small tongs, a chisel, a file and a folding ruler, crossed leather straps with brass buckles, darkened scorch marks along the hem, finely crafted',
    wornDesc: 'a long worn brown leather blacksmith\'s apron with crossed shoulder straps and brass buckles, an anvil emblem stamped on the bib, a wide front pocket holding tongs, chisels and a file, stitched patches and a scorched darker hem, worn over a rolled-sleeve linen work shirt, dark trousers and sturdy leather boots',
  },
  {
    key: 'halloween_smith_scarf',
    slot: 'accessory',
    nameKo: '장인의 두건',
    region: '일반',
    tone: '위트',
    lore: '녹슨 쇠빛 천을 머리에 두르고 뒤에서 질끈 묶었다. 장식은 하나도 없다. 불똥이 걸릴 자리를 만들지 않는 것이 대장간에서는 제일 좋은 멋이라서다. 매듭 끝 두 가닥만 일할 때마다 신나게 흔들린다.',
    art: 'a plain blacksmith\'s head kerchief: a simple dark rust-red cotton scarf tied at the back with two short tails, soft natural cloth folds, finely crafted',
    wornDesc: 'a plain dark rust-red cloth kerchief tied snugly over the head, two short knotted tails hanging at the back',
  },
  {
    key: 'halloween_vamp_parasol',
    slot: 'weapon',
    nameKo: '레이스 박쥐 양산',
    region: '일반',
    tone: '위트',
    lore: '가장자리에 레이스를 겹겹이 두른 검은 양산이다. 천에는 빨간 박쥐가 군데군데 날고, 굽은 손잡이에도 작은 박쥐 날개가 달렸다. 해를 가리는 양산인데, 정작 이 양산을 든 꼬마들은 해가 져야 집을 나선다.',
    art: 'a cute small black lace parasol, opened, with scalloped lace edges and tiny red bat silhouettes on the canopy, a slender black shaft with a pointed silver tip, a curved handle shaped like a little bat with spread wings, clearly a held parasol weapon, diagonal',
    wornDesc: 'a black lace parasol with a scalloped canopy of layered black and grey lace printed with small crimson bat silhouettes, a pointed silver finial on top, a slender black shaft and a curved black crook handle with a tiny bat-wing ornament',
  },
  {
    key: 'halloween_vamp_cape',
    slot: 'armor',
    nameKo: '박쥐 백작 망토',
    region: '일반',
    tone: '위트',
    lore: '어깨가 박쥐 날개처럼 물결지는 검은 망토에, 작은 박쥐 무늬가 찍힌 진홍 안감을 댔다. 금단추 재킷과 빨강 검정 줄무늬 양말은 꼬마 백작의 자랑이다. 품이 넉넉한 건 일부러다. 내년에도 입으려고.',
    art: 'a cute little vampire costume: an oversized black cape with a tall pointed collar and a bright red lining dotted with tiny bat prints, a short black tailcoat with a red bow at the neck, puffy shorts, striped stockings and little buckled shoes, cute and festive',
    wornDesc: 'a little vampire count costume: a long black cape lined in crimson with tiny bat prints, a very tall stand-up collar and scalloped bat-wing edges at the shoulders, worn over a black velvet jacket with gold piping and gold buttons, a dark waistcoat, a white jabot cravat with a red bow, puffy black bloomer shorts, red-and-black striped stockings and black buckled shoes',
  },
  {
    key: 'halloween_vamp_tophat',
    slot: 'accessory',
    nameKo: '박쥐 미니 실크햇',
    region: '일반',
    tone: '위트',
    lore: '손바닥만 한 실크햇이다. 진홍 띠 옆에 붉은 보석을 단 박쥐 브로치를 꽂았다. 머리에 쓰기엔 조금 작아서 늘 비스듬히 얹어 두는데, 그게 오히려 백작다워 보인다고들 한다.',
    art: 'a tiny black silk top hat, a wine-red satin band and a ribbon bow shaped like a bat, a small red gem at the center of the bow',
    wornDesc: 'a small grey-black silk top hat worn tilted on the head, with a crimson satin band and a little purple-and-red bat-wing brooch with a red gem pinned at the side',
  },
];

/** 할로윈 6종의 code — seed-catalog는 이 code를 active=false로 넣고, 개방(10/28 12:00)은 lib/game/halloween/open.ts가 한다. */
export const HALLOWEEN_ITEM_KEYS: readonly string[] = CATALOG_V7.map((c) => c.key);
