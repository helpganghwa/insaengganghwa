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

export interface CatalogItem {
  /** 영문 snake — 스프라이트 파일/스프라이트키 식별자. 전역 유니크. */
  key: string;
  slot: CatalogSlot;
  /** 한국어 표시명 (도감/인벤토리/공유). */
  nameKo: string;
  region: CatalogRegion;
  /** 보스 톤 통일 한국어 로어 (~60~120자). 등급/성능 언급 금지. */
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
    lore: '마른 우물 바닥에서 건져 올린 한손검. 점액에 천 년을 잠겨 날이 거뭇하게 삭았으나, 녹이 오히려 칼날을 더 질기게 만들었다. 버려진 시간이 벼린 검.',
    art: `one-handed sword, pitted corroded iron blade, mossy green tarnish, leather-wrapped grip, swamp grime, weathered, ${STYLE}`,
  },
  {
    key: 'ashfall_obsidian_dagger',
    slot: 'weapon',
    nameKo: '화산재 흑요석 단검',
    region: '서쪽 화산',
    lore: '끓는 강가에 식은 흑요석을 깎아 만든 단검. 고룡의 숨결이 지나간 자리에서 백 년에 걸쳐 천천히 단단해졌다. 쉬이 무뎌지지 않는다.',
    art: `short dagger, glassy black obsidian blade, sharp fractured edge, charred bone handle, ember-grey ash, volcanic, ${STYLE}`,
  },
  {
    key: 'runescar_warhammer',
    slot: 'weapon',
    nameKo: '룬흉터 전쟁망치',
    region: '고대 룬 산맥',
    lore: '폭주한 수호 룬에 깎여 떨어진 산의 살점을 머리 삼아 박은 전쟁망치. 내려칠 때마다 푸른 균열이 잠깐 빛났다가 식는다.',
    art: `heavy two-handed warhammer, grey carved-stone head, hairline blue rune cracks, iron-banded wooden haft, ancient, ${STYLE}`,
  },
  {
    key: 'orcfang_cleaver',
    slot: 'weapon',
    nameKo: '오크 송곳니 도끼',
    region: '오크 부락',
    lore: '부락에서 노획한 거대한 외날 도끼. 자루에 족장의 부러진 어금니가 박혀 있다. 그 무게를 견딘 자만이 휘두를 자격을 얻는다.',
    art: `one-handed broad cleaver axe, chipped crescent iron blade, bone tooth embedded in haft, crude lashings, rugged, ${STYLE}`,
  },
  {
    key: 'fallen_grace_rapier',
    slot: 'weapon',
    nameKo: '타락한 은총의 레이피어',
    region: '타락천사',
    lore: '타락천사가 떨어뜨린 검을 다시 벼린 가느다란 찌르기검. 신성과 저주가 한 날에 함께 흐른다. 빛을 등진 손이 마지막까지 쥐었던 검.',
    art: `slender thrusting rapier, pale silver blade, tarnished gold swept hilt, faint black feather motif, somber elegant, ${STYLE}`,
  },
  {
    key: 'iron_field_sword',
    slot: 'weapon',
    nameKo: '무쇠 야전검',
    region: '자유',
    lore: '이름 없는 병사들이 수없이 쥐었다 놓은 표준 한손검. 손때가 자루를 검게 물들였다. 특별할 것 없으나, 끝까지 부러지지 않은 검.',
    art: `plain one-handed arming sword, straight iron blade, worn leather grip, simple crossguard, sturdy utilitarian, ${STYLE}`,
  },
  {
    key: 'wanderer_oak_staff',
    slot: 'weapon',
    nameKo: '방랑자의 떡갈나무 지팡이',
    region: '자유',
    lore: '먼 길을 걷는 동안 손이 닿는 자리마다 반들반들해진 떡갈나무 지팡이. 머리에 끼운 돌은 주인이 떠난 밤에도 천천히 빛을 머금었다.',
    art: `tall wooden wizard staff, gnarled oak shaft, smooth worn grip, small clouded focus stone at top, travelled, ${STYLE}`,
  },
  {
    key: 'hunter_recurve_bow',
    slot: 'weapon',
    nameKo: '사냥꾼의 곡궁',
    region: '자유',
    lore: '한 계절을 통째로 숲에서 보낸 사냥꾼의 굽은 활. 시위는 수십 번 갈렸고, 활대는 그만큼 손에 길들었다. 기다림이 곧 사냥이었다.',
    art: `curved wooden recurve shortbow, taut bowstring, sinew binding, worn grip wrap, vertical, ${STYLE}`,
  },
  {
    key: 'marsh_reed_spear',
    slot: 'weapon',
    nameKo: '늪 갈대창',
    region: '늪지대',
    lore: '늪 깊은 갈대밭에서 베어 곧게 편 장창. 점액에 절어 검푸르게 굳었고, 그래서 부러지지 않는다. 마른 우물을 지키던 마지막 무기.',
    art: `long thrusting spear, dark hardened reed shaft, narrow leaf-shaped iron head, swamp-stained, slender, ${STYLE}`,
  },
  {
    key: 'emberforged_greatsword',
    slot: 'weapon',
    nameKo: '잉걸불 대검',
    region: '서쪽 화산',
    lore: '화산 대장간에서 식기까지 백 일을 기다린 양손 대검. 날 안쪽에 잿빛 결이 영원히 남았다. 식는 시간이 곧 담금질이었다.',
    art: `large two-handed greatsword, broad heat-grained steel blade, dark ember streaks, wrapped long grip, imposing, ${STYLE}`,
  },
  {
    key: 'runed_short_scepter',
    slot: 'weapon',
    nameKo: '룬각 단홀',
    region: '고대 룬 산맥',
    lore: '수호 룬의 파편을 깎아 손잡이에 새긴 짧은 홀. 균열은 식었지만 결을 따라 더듬으면 산이 무너지던 진동이 아직 만져진다.',
    art: `short ornate scepter, grey rune-carved stone head, fine hairline cracks, banded metal shaft, ancient relic, ${STYLE}`,
  },
  {
    key: 'orc_bone_maul',
    slot: 'weapon',
    nameKo: '오크 뼈 둔기',
    region: '오크 부락',
    lore: '부락의 천막을 무너뜨린 거구가 휘두르던 뼈 둔기. 굵은 관절뼈를 가죽끈으로 동여 만들었다. 포효를 견딘 손에만 들린다.',
    art: `crude heavy bone bludgeon, thick joint-bone head, leather-wrapped grip, jagged, brutal primitive, ${STYLE}`,
  },
  {
    key: 'twin_fang_daggers',
    slot: 'weapon',
    nameKo: '쌍 송곳니 단검',
    region: '자유',
    lore: '한 손에 하나씩, 늘 함께 갈려 온 한 쌍의 단검. 둘 중 하나만 남으면 균형이 어긋난다. 짝을 잃지 않고 버틴 칼.',
    art: `pair of matched curved daggers crossed, twin narrow blades, dark wrapped handles, symmetrical, sleek, ${STYLE}`,
  },
  {
    key: 'pilgrim_walking_glaive',
    slot: 'weapon',
    nameKo: '순례자의 언월도',
    region: '자유',
    lore: '지팡이 삼아 짚고 다니던 긴 자루의 언월도. 길 위의 흙먼지가 날에 얇게 앉았다. 걸어온 거리만큼 무뎌지지 않았다.',
    art: `polearm glaive, long worn wooden shaft, single curved blade, road dust patina, travelled, vertical, ${STYLE}`,
  },
  {
    key: 'fallen_feather_scythe',
    slot: 'weapon',
    nameKo: '깃 떨군 낫',
    region: '타락천사',
    lore: '추락한 자리에 흩어진 검은 깃과 부러진 날개뼈로 자루를 감은 낫. 거두는 것이 무엇이든, 한때 그것도 빛이었음을 안다.',
    art: `war scythe, long curved blade, black feather-bound shaft, pale bone fittings, dark solemn, ${STYLE}`,
  },
];

// 방어구·장신구는 후속 배치에서 추가.
const ARMOR: CatalogItem[] = [];
const ACCESSORIES: CatalogItem[] = [];

export const CATALOG_ITEMS: CatalogItem[] = [...WEAPONS, ...ARMOR, ...ACCESSORIES];

export const CATALOG_BY_SLOT = (slot: CatalogSlot): CatalogItem[] =>
  CATALOG_ITEMS.filter((c) => c.slot === slot);
