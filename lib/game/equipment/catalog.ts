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
    lore: '오크 부락에서 가장 머리 나쁜 전사가 "이러면 안 깨지겠지"라며 관절뼈를 통째로 묶어 만든 둔기. 놀랍게도 안 깨졌다. 더 놀랍게도 본인은 그날 다른 일로 넘어져 죽었다. 둔기는 멀쩡히 남아 다음 주인을 기다린다.',
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
  {
    key: 'butcher_falchion',
    slot: 'weapon',
    nameKo: '푸줏간 팔치온',
    region: '자유',
    tone: '위트',
    lore: '원래는 시장통 푸줏간에서 뼈를 가르던 넓적칼이다. 주인이 외상값 받으러 갔다가 영영 안 돌아온 뒤로 손이 여럿 바뀌었다. 무기치고는 둔하다는 평이 많지만, 정작 그 평을 한 자들은 대부분 그 둔한 칼에 한 번씩 혼이 났다.',
    art: `wide heavy falchion, broad cleaver-like steel blade, nicked edge, plain wooden grip, butcher-tool origin, ${STYLE}`,
  },
  {
    key: 'dawn_charge_saber',
    slot: 'weapon',
    nameKo: '여명 돌격 사브르',
    region: '자유',
    tone: '영웅담',
    lore: '안개가 채 걷히지 않은 새벽, 스무 기의 기병이 이 사브르를 앞세워 세 배 넘는 적진을 갈랐다. 살아 돌아온 자는 절반, 깃발은 끝까지 쓰러지지 않았다. 곡선진 날에는 그날의 흙과 함성이 얇게 배어 있다.',
    art: `curved cavalry saber, slender single-edged blade, brass knuckle-guard, faded ribbon on hilt, heroic, ${STYLE}`,
  },
  {
    key: 'marsh_hook_sickle',
    slot: 'weapon',
    nameKo: '늪 갈고리 낫',
    region: '늪지대',
    tone: '기괴',
    lore: '뱀장어잡이가 진흙 구멍에 던져 넣고 잡아채던 갈고리 낫. 어느 밤부터 빈 구멍에서도 무언가가 마주 잡아당기기 시작했다. 어부는 낫을 두고 떠났고, 낫은 아직 그 자리에서 가끔 저 혼자 흔들린다고 한다.',
    art: `hooked sickle, curved barbed iron hook, mud-caked short handle, frayed pull-cord, eerie swamp, ${STYLE}`,
  },
  {
    key: 'orc_horn_club',
    slot: 'weapon',
    nameKo: '오크 뿔나팔 곤봉',
    region: '오크 부락',
    tone: '위트',
    lore: '오크 부락의 신호병이 곤봉 끝에 뿔나팔을 박아 "치고 나서 바로 분다"는 효율을 자랑했다. 문제는 그 둘을 동시에 하려다 매번 제 이만 부러뜨렸다는 점이다. 곤봉은 멀쩡하고, 나팔 소리는 여전히 끔찍하다.',
    art: `crude wooden club, broken horn trumpet lashed to the head, tooth marks, leather wrap, comical brutal, ${STYLE}`,
  },
  {
    key: 'rune_split_longsword',
    slot: 'weapon',
    nameKo: '룬으로 갈라진 장검',
    region: '고대 룬 산맥',
    tone: '장엄',
    lore: '산이 무너지던 진동을 정통으로 맞아, 날 한가운데가 룬의 결을 따라 길게 갈라진 장검이다. 갈라진 틈은 닫히지 않으나 부러지지도 않는다. 빛에 비춰 들면 그 균열이 작은 산맥처럼 뻗어 있다.',
    art: `long straight longsword, deep blue-glinting crack splitting the blade lengthwise, stone-grey temper, banded grip, monumental, ${STYLE}`,
  },
  {
    key: 'widow_estoc',
    slot: 'weapon',
    nameKo: '미망인의 에스톡',
    region: '자유',
    tone: '비애',
    lore: '결투로 남편을 잃은 여인이 그 다음 결투를 위해 손에 쥐었던 가늘고 곧은 찌르기검. 상대를 이겼는지 졌는지는 기록에 없다. 다만 검집 안쪽에 한 줄, "이번이 마지막"이라 새겨져 있었다.',
    art: `long rigid estoc, narrow needle-like thrusting blade, plain dark hilt, worn engraved scabbard motif, mournful, ${STYLE}`,
  },
  {
    key: 'ember_falx',
    slot: 'weapon',
    nameKo: '잉걸 팔크스',
    region: '서쪽 화산',
    tone: '장엄',
    lore: '안으로 휜 한날의 팔크스를, 흘러내린 용암이 식어 만든 골을 거푸집 삼아 벼렸다. 날 안쪽 곡선에 불의 결이 영원히 굳어, 곡면을 따라 시선이 미끄러진다. 베는 무기라기보다 끌어당겨 가르는 무기다.',
    art: `inward-curved falx blade, single hooked edge, fire-grained dark steel, long two-handed grip, imposing, ${STYLE}`,
  },
  {
    key: 'ledger_quarterstaff',
    slot: 'weapon',
    nameKo: '장부 지팡이',
    region: '자유',
    tone: '일상',
    lore: '세금을 걷으러 다니던 서기가 평생 짚고 다닌 물푸레 봉. 한쪽 끝에는 잉크병을 매달았던 끈 자국이, 다른 쪽에는 개를 쫓던 흠집이 남았다. 누구도 무기로 본 적 없지만, 누구도 그 앞에서 장부를 속이지 못했다.',
    art: `plain ash quarterstaff, ink-stained one end, dog-chasing scuffs, smooth worn middle grip, mundane, ${STYLE}`,
  },
  {
    key: 'feather_kris',
    slot: 'weapon',
    nameKo: '깃 흘린 크리스',
    region: '타락천사',
    tone: '비애',
    lore: '날이 물결처럼 굽이친 단검. 추락한 자리 근처에서 주워졌고, 칼집을 열 때마다 검은 깃 한 올이 어디선가 떨어진다. 깃을 세어 본 사람들은 매번 수가 다르다고 했고, 그래서 아무도 더는 세지 않는다.',
    art: `wavy-bladed kris dagger, rippling pattern-welded steel, dark bound handle, single black feather, sorrowful, ${STYLE}`,
  },
  {
    key: 'mistwood_longbow',
    slot: 'weapon',
    nameKo: '안개숲 장궁',
    region: '자유',
    tone: '영웅담',
    lore: '국경 안개숲을 혼자 지키던 순찰자의 장궁. 길 잃은 행상 마흔 명을 그가 쏜 신호 화살이 살려 데려왔다는 이야기가 마을마다 조금씩 다르게 전해진다. 정작 본인은 한 번도 그 수를 정정하지 않았다.',
    art: `tall slender longbow, pale mist-grey wood, taut string, simple leather grip, vertical, heroic, ${STYLE}`,
  },
  {
    key: 'tunnel_war_pick',
    slot: 'weapon',
    nameKo: '갱도 전투곡괭이',
    region: '자유',
    tone: '일상',
    lore: '광부가 막장에서 돌을 쪼던 곡괭이다. 갱이 무너진 날, 그것으로 벽을 두드려 사흘 만에 구조 신호를 보냈다. 이후로 누구도 그걸 광구 도구라 부르지 않았지만, 정작 곡괭이는 여전히 돌 깨는 데 가장 잘 든다.',
    art: `heavy war pick, single curved spike head, blunt back, rock-scarred iron, sturdy wooden haft, utilitarian, ${STYLE}`,
  },
  {
    key: 'dream_answer_orb_staff',
    slot: 'weapon',
    nameKo: '꿈으로 답하는 구슬홀',
    region: '자유',
    tone: '수수께끼',
    lore: '머리에 탁한 구슬을 얹은 홀. 들고 잔 사람은 다음 날 아침, 묻지 않은 질문의 답을 알고 깬다고 한다. 정작 그 답이 무슨 질문에 대한 것인지는 끝내 모른다. 답이 먼저 오고 질문이 나중에 온다.',
    art: `tall staff, cloudy pale orb cradled at the head, twisted dark shaft, faint inner haze, mysterious, ${STYLE}`,
  },
  {
    key: 'bog_frog_trident',
    slot: 'weapon',
    nameKo: '늪 개구리 작살',
    region: '늪지대',
    tone: '담백',
    lore: '늪지대 아이들이 개구리와 미꾸라지를 찌르던 세 갈래 작살. 어른 키만 한 자루에 손때가 층층이 앉았다. 큰 싸움에 쓰인 적은 없다. 다만 늪에서 빈손으로 돌아온 적도 없다.',
    art: `three-pronged fishing trident, long worn wooden shaft, simple iron tines, marsh wear, plain, ${STYLE}`,
  },
  {
    key: 'jester_morningstar',
    slot: 'weapon',
    nameKo: '광대의 별곤봉',
    region: '자유',
    tone: '위트',
    lore: '떠돌이 광대가 "웃기려고" 들고 다니던 가시 박힌 별곤봉. 공연에선 한 번도 휘두르지 않았고, 늘 들고만 다녔다. 그런데 그 광대가 머문 마을에서는 이상하게 시비가 줄었다. 소품이라기엔 가시가 너무 진짜였다.',
    art: `spiked ball morningstar on a short haft, jingling tiny bells on the chain, worn grip, ironic playful menace, ${STYLE}`,
  },
  {
    key: 'ashen_nodachi',
    slot: 'weapon',
    nameKo: '잿빛 노다치',
    region: '서쪽 화산',
    tone: '장엄',
    lore: '키를 넘는 길이로 벼린 대태도. 화산 열기에 식히는 동안 날 전체에 잿빛 물결무늬가 번져, 휘두르면 그 무늬가 따라 흐르는 듯 보인다. 한 호흡에 한 번밖에 휘두를 수 없으나, 그 한 번이면 충분하다고들 했다.',
    art: `very long two-handed nodachi, slender heat-rippled ash-grey blade, long wrapped grip, sweeping imposing, ${STYLE}`,
  },
  {
    key: 'unsent_letter_dagger',
    slot: 'weapon',
    nameKo: '부치지 못한 편지칼',
    region: '자유',
    tone: '비애',
    lore: '본래 편지 봉투를 가르던 가느다란 칼이다. 주인이 끝내 부치지 못한 편지 한 장과 함께 서랍에서 발견됐다. 편지는 백지였다. 칼날은 한 번도 종이 말고 다른 것을 가른 적 없는데, 이상하게 손에 들면 무겁다.',
    art: `slim letter-opener dagger, thin polished blade, simple bone handle, desk-drawer patina, melancholic, ${STYLE}`,
  },
  {
    key: 'rune_echo_maul',
    slot: 'weapon',
    nameKo: '룬 메아리 큰망치',
    region: '고대 룬 산맥',
    tone: '수수께끼',
    lore: '머리를 산의 돌로 깎은 큰망치. 내려치지 않아도, 귀를 대면 아주 낮은 한 음이 끝없이 울린다. 그 음을 따라 흥얼거린 자들은 하나같이 같은 가락을 떠올렸다는데, 누구도 그 노래를 배운 적이 없다.',
    art: `heavy stone-headed maul, faint resonant hum lines etched in the rock, banded haft, enigmatic ancient, ${STYLE}`,
  },
  {
    key: 'orc_junk_flail',
    slot: 'weapon',
    nameKo: '오크 잡동사니 도리깨',
    region: '오크 부락',
    tone: '위트',
    lore: '사슬 끝에 냄비, 문고리, 누군가의 투구 반쪽이 한데 매달린 도리깨. 오크 부락의 막내가 "있는 거 다 달면 더 아프겠지"라며 만들었다. 논리는 형편없었으나 결과는 부정하기 어려웠다. 휘두르면 소리부터 요란하다.',
    art: `chain flail, mismatched pot lid and door ring and half-helmet bound at the end, clattering, scrappy, ${STYLE}`,
  },
  {
    key: 'shepherd_sling',
    slot: 'weapon',
    nameKo: '목동의 무릿매',
    region: '자유',
    tone: '일상',
    lore: '양치기 소년이 늑대를 쫓던 가죽 무릿매. 짐승을 맞힌 적은 손에 꼽지만, 돌이 휙 날아가는 소리만으로 무리를 흩어 놓기엔 충분했다. 양 한 마리 잃지 않고 한 해를 넘긴 도구치고는, 너무 소박하게 생겼다.',
    art: `simple leather sling, worn pouch, two braided cords, smooth river stone, humble pastoral, ${STYLE}`,
  },
  {
    key: 'scaled_guard_glaive',
    slot: 'weapon',
    nameKo: '비늘 막은 언월도',
    region: '서쪽 화산',
    tone: '영웅담',
    lore: '고룡의 숨결 앞에 마지막까지 줄을 지킨 창병의 언월도. 날에는 비늘에 긁힌 깊은 골이 셋, 자루에는 그날 잡았던 손자국이 그을려 남았다. 창병은 살아남았고, 언월도는 그 이야기를 대신 짊어졌다.',
    art: `polearm glaive, long curved blade with three deep scale-gouges, scorched grip, sturdy shaft, heroic, ${STYLE}`,
  },
  {
    key: 'crossroad_crook',
    slot: 'weapon',
    nameKo: '갈림길 지팡이',
    region: '자유',
    tone: '수수께끼',
    lore: '끝이 갈고리처럼 굽은 양치기 지팡이. 평지에서는 멀쩡하나 갈림길에 세워 두면 굽은 끝이 늘 가지 말아야 할 길을 가리킨다고 한다. 그 말을 시험한 자들은 돌아와 아무 말도 하지 않았다.',
    art: `long shepherd's crook staff, hooked curved top, pale worn wood, plain banding, quietly uncanny, ${STYLE}`,
  },
  {
    key: 'last_gate_partisan',
    slot: 'weapon',
    nameKo: '마지막 문지기의 파르티잔',
    region: '자유',
    tone: '비애',
    lore: '성문이 무너지던 밤, 끝까지 자리를 뜨지 않은 늙은 위병의 폭넓은 창. 다른 이들은 모두 안쪽으로 물러섰고, 그는 문턱을 한 발도 넘지 않았다. 날 밑동에 짧게 새겨진 글자는 이름이 아니라 "여기까지"였다.',
    art: `broad-bladed partisan polearm, wide leaf spearhead with side lugs, worn shaft, faint carved words, mournful, ${STYLE}`,
  },
  {
    key: 'dredge_bone_pick',
    slot: 'weapon',
    nameKo: '준설 뼈곡괭이',
    region: '자유',
    tone: '기괴',
    lore: '강바닥을 긁어 올리던 준설꾼이, 진흙에서 함께 딸려 온 길고 흰 것을 자루에 박아 만든 곡괭이. 그게 무슨 뼈인지 묻는 사람에게 그는 늘 화제를 돌렸다. 곡괭이는 잘 들었고, 준설꾼은 다시는 그 강에 들어가지 않았다.',
    art: `war pick, long pale bone spike as the head, riveted to a plain haft, river silt stains, unsettling, ${STYLE}`,
  },
  {
    key: 'carnival_chakram',
    slot: 'weapon',
    nameKo: '곡예단 차크람',
    region: '자유',
    tone: '위트',
    lore: '유랑 곡예단에서 접시 대신 돌리던 둥근 고리날. 단장이 "이건 묘기용"이라 우겼지만, 가장자리는 접시를 자를 일이 없을 만큼 날카로웠다. 곡예가 끝나면 늘 한 개씩 사라졌고, 단장은 그 이야기를 꺼내면 표정이 굳었다.',
    art: `flat circular chakram throwing ring, sharpened outer edge, polished steel, small grip wrap, showy ironic, ${STYLE}`,
  },
  {
    key: 'oathline_halberd',
    slot: 'weapon',
    nameKo: '맹세 줄의 할버드',
    region: '자유',
    tone: '영웅담',
    lore: '같은 맹세를 한 열두 명이 어깨를 맞대고 세웠던 방벽, 그 한가운데에 박혀 있던 할버드. 줄이 무너지지 않는 한 이 한 자루도 쓰러지지 않는다는 약속이 있었다. 줄은 그날 끝까지 무너지지 않았다.',
    art: `tall halberd, axe blade with spike and hook, long banded shaft, frayed oath-cord tied below the head, heroic, ${STYLE}`,
  },
  {
    key: 'woodcutter_hatchet',
    slot: 'weapon',
    nameKo: '나무꾼 손도끼',
    region: '자유',
    tone: '담백',
    lore: '겨울 땔감을 패던 손도끼. 날은 자주 갈려 손바닥만큼 작아졌고, 자루는 세 번 갈아 끼웠다. 큰일을 해낸 적은 없다. 다만 그 집 아궁이는 어느 겨울에도 식은 적이 없었다.',
    art: `small one-handed hatchet, short worn axe head, oft-replaced wooden handle, woodchip nicks, plain, ${STYLE}`,
  },
  {
    key: 'fallen_censer_flail',
    slot: 'weapon',
    nameKo: '타락한 향로 도리깨',
    region: '타락천사',
    tone: '기괴',
    lore: '사슬 끝에 깨진 향로가 매달린 도리깨. 휘두르면 향이 피어오르는데, 불을 붙인 적이 없다. 그 연기를 들이쉰 자는 잠깐, 한 번도 가 본 적 없는 높은 곳에서 내려다보는 기분이 들었다고 한다. 곧 잊었지만.',
    art: `chain flail with a cracked thurible censer at the end, faint smoke without fire, tarnished metal, eerie sacred, ${STYLE}`,
  },
  {
    key: 'nightwatch_spear',
    slot: 'weapon',
    nameKo: '야경꾼의 창',
    region: '자유',
    tone: '일상',
    lore: '도시 야경꾼이 골목을 돌 때 들던 평범한 창. 실전에 쓴 밤보다 벽에 비스듬히 기대 둔 밤이 훨씬 많았다. 그래도 그 창이 골목 어귀에 서 있는 한, 그 동네 사람들은 등을 켜 두지 않고 잤다.',
    art: `plain watchman's spear, simple leaf-shaped head, long worn shaft, leaning-wear scuff, mundane reassuring, ${STYLE}`,
  },
  {
    key: 'rune_needle_rapier',
    slot: 'weapon',
    nameKo: '룬 바늘 레이피어',
    region: '고대 룬 산맥',
    tone: '장엄',
    lore: '산의 돌결을 따라 깎아 바늘처럼 가늘게 벼린 찌르기검. 날 전체에 머리카락 굵기의 룬 균열이 흐르고, 빛을 받으면 그 선들이 한순간 푸르게 살아난다. 가볍지만, 가벼움이 무게를 가린 것뿐이다.',
    art: `extremely slender rapier, needle-thin blade laced with hairline blue rune lines, fine swept guard, monumental, ${STYLE}`,
  },
  {
    key: 'grandfather_axe',
    slot: 'weapon',
    nameKo: '할아버지의 그 도끼',
    region: '자유',
    tone: '위트',
    lore: '"이거 우리 할아버지가 쓰던 도끼야." 머리는 두 번, 자루는 세 번 갈았다. 그래도 사람들은 여전히 그것을 "할아버지의 그 도끼"라 부른다. 정작 잘 들기는 어느 때보다 잘 든다. 무엇이 같고 무엇이 바뀌었는지는 따지지 않기로 한다.',
    art: `well-used one-handed axe, obviously newer head on a re-handled shaft, mismatched wear, homely ironic, ${STYLE}`,
  },
  {
    key: 'silt_anchor_flail',
    slot: 'weapon',
    nameKo: '진흙 닻 도리깨',
    region: '자유',
    tone: '기괴',
    lore: '강 사공이 작은 닻을 사슬에 매어 휘두르던 도리깨. 어느 날 그 닻이 바닥에서 끌어 올린 것을 본 뒤로, 사공은 노 젓는 자리를 옮겼다. 닻은 아직 진흙을 머금고 있고, 가끔 마른 진흙이 저 혼자 떨어진다.',
    art: `chain flail with a small rusted boat anchor as the head, dried river silt clumps, frayed chain, ominous, ${STYLE}`,
  },
  {
    key: 'herald_banner_poleaxe',
    slot: 'weapon',
    nameKo: '전령의 깃대 폴액스',
    region: '자유',
    tone: '영웅담',
    lore: '전령은 본래 싸우지 않는다. 그러나 깃발이 쓰러지면 줄도 무너지기에, 이 전령은 깃대 끝에 도끼날을 박고 끝까지 그 자리에 섰다. 깃천은 누더기가 되었어도 깃대는 한 번도 기울지 않았다.',
    art: `poleaxe with a banner-pole haft, axe head and top spike, tattered banner remnant near the top, heroic, ${STYLE}`,
  },
  {
    key: 'scorched_reaping_hook',
    slot: 'weapon',
    nameKo: '그을린 거둠낫',
    region: '자유',
    tone: '담백',
    lore: '불 지나간 밭에서 타다 만 그루터기를 베어 정리하던 한손 낫. 화려한 사연은 없다. 다만 그 밭은 이듬해 다시 푸르렀고, 낫은 그 일을 묵묵히 거들었을 뿐이다.',
    art: `one-handed reaping hook, short inward-curved blade, soot-darkened edge, plain wooden grip, understated, ${STYLE}`,
  },
  {
    key: 'lullaby_war_fan',
    slot: 'weapon',
    nameKo: '자장가 부르는 철선',
    region: '자유',
    tone: '수수께끼',
    lore: '살에 날을 숨긴 무쇠 부채. 펴고 접을 때 아주 희미한 가락이 새는데, 늙은이들은 그게 아주 오래된 자장가라 했다. 누가 그 노래를 부채에 넣었는지는 모른다. 듣고 졸지 않은 사람도 아직 없다.',
    art: `folding iron war fan, hidden blade edges on the ribs, faint humming when opened, lacquered dark, mysterious, ${STYLE}`,
  },
  {
    key: 'deserter_shortsword',
    slot: 'weapon',
    nameKo: '탈영병의 단검',
    region: '자유',
    tone: '비애',
    lore: '더는 싸우지 않으려고 누군가 길섶에 던져 버린 짧은 검. 던진 손은 끝내 돌아오지 않았고, 검은 풀숲에서 다음 사람을 기다렸다. 칼자루의 끈은 누가 급히 풀어낸 듯 매듭이 반쯤 끊겨 있다.',
    art: `plain short sword, blade half-buried look, grass-worn finish, hilt cord with a half-cut knot, sorrowful, ${STYLE}`,
  },
];

// 방어구·장신구는 후속 배치에서 추가.
const ARMOR: CatalogItem[] = [];
const ACCESSORIES: CatalogItem[] = [];

export const CATALOG_ITEMS: CatalogItem[] = [...WEAPONS, ...ARMOR, ...ACCESSORIES];

export const CATALOG_BY_SLOT = (slot: CatalogSlot): CatalogItem[] =>
  CATALOG_ITEMS.filter((c) => c.slot === slot);
