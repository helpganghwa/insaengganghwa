/**
 * 카탈로그 단일 진실 원천 — 아이템 식별/로어/스프라이트.
 *
 * 한 배열이 다음을 모두 공급한다:
 *  - DB 시드 (`scripts/seed-catalog.ts`, `catalogItems`)
 *  - 스프라이트 파이프라인 프롬프트 (`scripts/sprite-pipeline.ts`)
 *  - 도감/인벤토리/공유 UI 표시명
 *  - 확률 공시 슬롯별 종 수
 *
 * 규칙 (GDD §3.1 / docs/LORE.md):
 *  - 등급·희소성·성능 차등 **없음**. 아이템 차이는 외관·도감·로어뿐.
 *  - `key`: 영문 snake. `public/sprites/<slot>/<key>.png` 파일명 = `catalogItems.spriteKey`.
 *  - `lore`: 보스 스토리 톤(장엄·서사·간결, ~60~120자). 등급/성능 표현 금지.
 *  - `art`: Pixellab 64×64 생성 키워드(형태·재질·색·분위기). 글로우/등급 제외(GDD §6 — 코드가 강화 글로우 부여).
 *  - 세계관 연결은 느슨하게(~40%): region 이 5권역이면 보스의 땅과 엮임, '자유'면 권역 무관.
 *
 * 목표: 슬롯당 50종(무기/방어구/장신구 = 150), 이후 가변 추가(GDD §10).
 */

export type CatalogSlot = 'weapon' | 'armor' | 'accessory';

export type CatalogRegion =
  | '늪지대'
  | '오크 부락'
  | '고대 룬 산맥'
  | '서쪽 화산'
  | '타락천사'
  | '자유';

/** 로어 정서 — 배치 내 고르게 분포(한 톤이 슬롯의 ~1/4 초과 금지). docs/LORE.md §1. */
export type CatalogTone =
  | '장엄'
  | '담백'
  | '위트'
  | '비애'
  | '기괴'
  | '일상'
  | '영웅담'
  | '수수께끼';

export interface CatalogItem {
  /** 영문 snake — 스프라이트 파일/스프라이트키 식별자. 전역 유니크. */
  key: string;
  slot: CatalogSlot;
  /** 한국어 표시명 (도감/인벤토리/공유). */
  nameKo: string;
  region: CatalogRegion;
  /** 로어 정서(다양성 강제용). docs/LORE.md §1. */
  tone: CatalogTone;
  /** 한국어 로어 (~120~260자, 2~4문장). 아이템마다 고유 사연·개성. 등급/성능 언급 금지. */
  lore: string;
  /** Pixellab 64×64 생성 키워드 (영문, 글로우/등급 제외). */
  art: string;
}

const STYLE = 'clean readable silhouette, fantasy RPG pixel art inventory icon, transparent background';

/** 슬롯별 묶음을 합쳐 단일 export. 배치(슬롯)별로 확장한다. */

// ─────────────────────────────────────────────────────────────────────────────
// 무기 (목표 50) — 배치 1/약4
// ─────────────────────────────────────────────────────────────────────────────
const WEAPONS: CatalogItem[] = [
  {
    key: 'marsh_rusted_blade',
    slot: 'weapon',
    nameKo: '녹슨 늪칼',
    region: '늪지대',
    tone: '담백',
    lore: '늪 마을 대장간이 한철에 수십 자루씩 찍어내던 평범한 한손검이다. 이름난 주인도, 전해지는 무용담도 없다. 마른 우물을 치우던 인부가 진흙 속에서 한 자루를 건져 올렸고, 점액에 절어 검붉게 변해 있었다. 닦으니 멀쩡히 들렸다. 그게 전부다.',
    art: `plain one-handed sword, pitted reddish-rusted iron blade, dried swamp mud, leather-wrapped grip, simple crossguard, understated, ${STYLE}`,
  },
  {
    key: 'ashfall_obsidian_dagger',
    slot: 'weapon',
    nameKo: '화산재 흑요석 단검',
    region: '서쪽 화산',
    tone: '기괴',
    lore: '끓는 강에서 건진 흑요석 단검. 칼날에 비친 얼굴이 이따금 제 것이 아닌 표정을 짓는다고 사람들은 말한다. 고룡의 숨결을 너무 가까이서 쬔 유리는 무언가를 본 채로 굳어 버린 모양이다. 들여다본 자는 많지만, 오래 들여다본 자는 없다.',
    art: `short dagger, glassy black obsidian blade, faint distorted reflection, fractured razor edge, charred bone handle, eerie, ${STYLE}`,
  },
  {
    key: 'runescar_warhammer',
    slot: 'weapon',
    nameKo: '룬흉터 전쟁망치',
    region: '고대 룬 산맥',
    tone: '장엄',
    lore: '산이 스스로 일어서던 날, 무너진 비탈에서 떨어져 나온 한 덩이를 머리 삼아 박은 전쟁망치다. 내려칠 때마다 푸른 균열이 결을 따라 번쩍 살아났다가 다시 잠든다. 산의 분노를 한 줌 떼어 자루에 묶어 둔 셈이라, 드는 일조차 쉽지 않다.',
    art: `massive two-handed warhammer, grey carved-stone head, vivid blue rune cracks, iron-banded oak haft, monumental, ${STYLE}`,
  },
  {
    key: 'orcfang_cleaver',
    slot: 'weapon',
    nameKo: '오크 송곳니 도끼',
    region: '오크 부락',
    tone: '위트',
    lore: '오크 족장이 손수 만들었다는 외날 도끼. 자루에 제 부러진 어금니를 박아 넣고 "이빨이 둘이면 더 잘 문다"는 명언을 남겼다고 한다. 도끼는 멀쩡하나 그 말은 끝내 아무도 이해하지 못했다. 잘 들기는 한다.',
    art: `one-handed broad cleaver axe, chipped crescent iron blade, large tusk wedged into haft, crude lashings, rugged, ${STYLE}`,
  },
  {
    key: 'fallen_grace_rapier',
    slot: 'weapon',
    nameKo: '타락한 은총의 레이피어',
    region: '타락천사',
    tone: '비애',
    lore: '추락한 자리에서 부러진 검을 모아 다시 가늘게 벼린 찌르기검. 한 날에 신성과 저주가 함께 흐른다. 휘두르면 아주 잠깐 깃털 스치는 소리가 나는데, 베인 자보다 쥔 자가 먼저 그 소리에 멈춰 선다고 한다.',
    art: `slender thrusting rapier, pale silver blade, tarnished gold swept hilt, faint black feather etching, somber elegant, ${STYLE}`,
  },
  {
    key: 'iron_field_sword',
    slot: 'weapon',
    nameKo: '무쇠 야전검',
    region: '자유',
    tone: '일상',
    lore: '병참 창고에 천 자루씩 쌓여 있던 보급용 한손검. 이가 나가면 갈고, 자루가 닳으면 가죽을 새로 감았다. 누구의 것도 아니었기에 누구나 들었다. 끝내 이름은 붙지 않았고, 그래서 부러져도 아무도 슬퍼하지 않았다.',
    art: `standard-issue one-handed arming sword, straight iron blade, re-wrapped worn grip, plain pommel, utilitarian, ${STYLE}`,
  },
  {
    key: 'wanderer_oak_staff',
    slot: 'weapon',
    nameKo: '방랑자의 떡갈나무 지팡이',
    region: '자유',
    tone: '수수께끼',
    lore: '어느 노인이 평생 짚고 다녔다는 떡갈나무 지팡이. 머리에 박힌 흐린 돌은 빛도, 열도, 어떤 마법도 내지 않는다. 다만 그 노인이 닿았던 마을마다 이상하리만치 그해 농사가 잘되었다는 이야기만 길 따라 남았다. 우연일 것이다. 아마도.',
    art: `tall wooden wizard staff, gnarled oak shaft, smooth hand-worn grip, dull clouded stone at crown, enigmatic, ${STYLE}`,
  },
  {
    key: 'hunter_greenwood_bow',
    slot: 'weapon',
    nameKo: '푸른숲 사냥활',
    region: '자유',
    tone: '영웅담',
    lore: '늑대 떼가 마을 외양간을 노리던 겨울, 사냥꾼 한 사람이 사흘 밤을 눈밭에 엎드려 이 활로 우두머리를 잡았다. 마을은 그를 영웅이라 불렀고, 그는 그저 활을 손질하며 "운이 좋았다"고만 했다. 시위에는 아직 그 겨울의 송진 냄새가 밴다.',
    art: `curved wooden recurve shortbow, taut sinew bowstring, frost-pale wood grain, worn grip wrap, vertical, heroic, ${STYLE}`,
  },
  {
    key: 'marsh_reed_spear',
    slot: 'weapon',
    nameKo: '늪 갈대창',
    region: '늪지대',
    tone: '담백',
    lore: '늪지대 어부들이 깊은 갈대밭을 헤칠 때 쓰던 긴 창. 물뱀을 쫓고, 가끔은 더 큰 것도 쫓았다. 점액에 절어 검푸르게 굳은 자루는 어지간해선 휘지 않는다. 무기라기보다 늪에서 살아남는 살림 도구에 가까웠다.',
    art: `long thrusting spear, dark hardened reed shaft, narrow leaf-shaped iron head, swamp-stained, plain, ${STYLE}`,
  },
  {
    key: 'emberforged_greatsword',
    slot: 'weapon',
    nameKo: '잉걸불 대검',
    region: '서쪽 화산',
    tone: '장엄',
    lore: '화산 대장간 가장 깊은 화덕에서 벼려진 양손 대검. 식는 동안 잿빛 결이 날 안쪽에 강물처럼 굳어, 들어 올리면 그 무늬가 불길의 잔영을 닮았다. 한 번 휘두르면 공기가 갈라지며 잠시 뜨거워진다고, 본 자들은 입을 모은다.',
    art: `large two-handed greatsword, broad heat-grained steel blade, deep ash river streaks, long wrapped grip, imposing, ${STYLE}`,
  },
  {
    key: 'glass_question_scepter',
    slot: 'weapon',
    nameKo: '물음의 유리홀',
    region: '자유',
    tone: '수수께끼',
    lore: '머리에 속이 빈 유리구가 달린 짧은 홀. 구 안에는 아무것도 없다—그런데 흔들면 무언가 굴러다니는 소리가 난다. 만든 자도, 쥔 자도, 부순 자도 그 소리의 정체를 끝내 말하지 못했다. 질문만 남기고 답은 가져가는 물건이다.',
    art: `short ornate scepter, hollow clear glass orb at head, faint something-inside rattle, banded silver shaft, mysterious, ${STYLE}`,
  },
  {
    key: 'orc_bonk_maul',
    slot: 'weapon',
    nameKo: '오크 박치기 둔기',
    region: '오크 부락',
    tone: '위트',
    lore: '오크 부락에서 가장 머리 나쁜 전사가 "이러면 안 깨지겠지"라며 관절뼈를 통째로 묶어 만든 둔기. 놀랍게도 안 깨졌다. 더 놀랍게도 본인은 그날 다른 일로 넘어져 기절했다. 둔기는 멀쩡히 남아 다음 주인을 기다린다.',
    art: `crude heavy bludgeon, single huge joint-bone head, thick leather lashings, lopsided, comically brutal, ${STYLE}`,
  },
  {
    key: 'parted_twin_daggers',
    slot: 'weapon',
    nameKo: '엇갈린 쌍단검',
    region: '자유',
    tone: '비애',
    lore: '본래 한 쌍이었다. 두 자매가 하나씩 나눠 가졌고, 언젠가 다시 맞대기로 했다. 지금 남은 건 한 자루뿐이다. 짝을 잃은 칼은 균형이 미세하게 어긋나, 쥔 손이 자꾸 없는 다른 손을 찾는다. 나머지 하나가 어디 있는지는 아무도 모른다.',
    art: `single curved dagger, faint mark where a twin once paired, dark wrapped handle, slightly off-balance, lonesome, ${STYLE}`,
  },
  {
    key: 'tollkeeper_glaive',
    slot: 'weapon',
    nameKo: '통행세 받던 언월도',
    region: '자유',
    tone: '일상',
    lore: '다리 어귀에서 통행세를 걷던 늙은 문지기의 언월도. 실제로 휘두른 적은 손에 꼽고, 대부분은 그저 비스듬히 기대 세워 두는 용도였다. 날에 앉은 흙먼지가 칼보다 두껍다. 그래도 다리를 건넌 누구도 그 앞에서 떼를 쓰지는 못했다.',
    art: `polearm glaive, long worn wooden shaft, single curved blade thick with road dust, leaning-post wear, mundane, ${STYLE}`,
  },
  {
    key: 'fallen_feather_scythe',
    slot: 'weapon',
    nameKo: '깃 떨군 낫',
    region: '타락천사',
    tone: '기괴',
    lore: '추락한 자리에 검은 깃이 눈처럼 쌓였고, 누군가 그 깃과 부러진 날개뼈로 낫자루를 감았다. 베어 넘긴 풀에서 가끔 깃털이 함께 떨어진다—심지 않은 자리에서도. 거두는 손은 그것이 무엇의 깃인지 묻지 않는 편이 낫다.',
    art: `war scythe, long curved blade, black feather-bound shaft, pale wing-bone fittings, unsettling, ${STYLE}`,
  },
];

// 방어구·장신구는 후속 배치에서 추가.
const ARMOR: CatalogItem[] = [];
const ACCESSORIES: CatalogItem[] = [];

export const CATALOG_ITEMS: CatalogItem[] = [...WEAPONS, ...ARMOR, ...ACCESSORIES];

export const CATALOG_BY_SLOT = (slot: CatalogSlot): CatalogItem[] =>
  CATALOG_ITEMS.filter((c) => c.slot === slot);
