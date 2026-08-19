import type { CatalogItem } from './catalog';

/**
 * 5차 편성(2026-08-19) — 무기 6종. 기존 40종 중 아바타 생성에 문제가 있던 6종을 대신한다.
 *
 * 후보 190종을 만들어 아바타 검증(무기당 남녀 각 1장, 최대 6회차)을 통과한 것만 남겼다.
 * 이름·로어는 현행 40종의 문법을 따랐다 — <구체적 수식구> + <무기 종류>, 로어는
 * 형태 묘사 → 그 형태가 만드는 현상 → 한 걸음 물러난 여운.
 *
 * ⚠ 교체되는 6종은 이 배열이 아니라 **DB active=false**로 뺀다 — 카탈로그 배열에서 지우면
 *   이미 보유한 유저의 장비가 그림·이름·로어를 잃는다(catalog.ts 주석).
 */
export const CATALOG_V5: CatalogItem[] = [
  {
    "key": "temple_ringstaff_khakkhara",
    "slot": "weapon",
    "nameKo": "육환 석장",
    "region": "신전",
    "tone": "전설",
    "lore": "원래는 고리가 아홉이었다고 한다. 순례를 처음 나선 승려가 셋을 길에 두고 왔는데, 하나는 끊긴 다리를 잇는 데 썼고 하나는 굶은 아이의 밥값이 됐다. 나머지 하나는 어디에 썼는지 끝내 말하지 않았다. 흰 자루 끝에 남은 여섯이 지금도 걸음마다 짤랑이고, 빈자리 셋은 채우지 않는 것이 법이 됐다.",
    "art": "a ringed pilgrim khakkhara staff — a tall pale wooden shaft crowned by a golden pagoda finial hung with six loose jingling rings, a silk knot below the head, sacred and stately, clearly a ringed monk staff weapon, no text, large, diagonal",
    "wornDesc": "tall pale wooden staff topped with an ornate gold finial of curling scrollwork hung with loose gold rings, a red silk knot tassel tied below the head"
  },
  {
    "key": "volcano_flame_blade",
    "slot": "weapon",
    "nameKo": "놓을 곳 없는 화염검",
    "region": "화산",
    "tone": "비애",
    "lore": "검은 무쇠 코등이 위로 날이 통째로 주황 불꽃이다. 손잡이는 서늘한데 눈앞은 쉼 없이 일렁이고, 벤 자리는 갈라지기 전에 먼저 그을린다. 칼집이 들어갈 자리가 없어 벽에 세워 둘 수도, 허리에 찰 수도 없다. 그래서 이 검의 주인은 언제나 검을 손에 든 사람으로 기억된다.",
    "art": "a sword whose blade is living flame — a blackened iron hilt from which a tall tapering blade of bright orange fire rises, its edges licking into sparks, heat shimmer around it, blazing and vivid, clearly a single sword weapon, no text, large, diagonal",
    "wornDesc": "sword with a dark ornate iron crossguard and a short wrapped grip, its blade a tall tapering body of bright orange flame with licking edges"
  },
  {
    "key": "swamp_antler_bow",
    "slot": "weapon",
    "nameKo": "사슴뿔 활",
    "region": "늪지대",
    "tone": "아름다운",
    "lore": "이 활은 아버지가 쓰던 것이고, 아버지는 그 뿔의 주인을 직접 봤다고 했다. 열두 갈래로 뻗은 큰 놈이었는데 끝내 시위를 놓지 않고 돌아왔단다. 대신 이듬해 같은 자리에 떨어져 있던 뿔을 주워 활대를 맸다. 나는 아직 열두 갈래짜리를 만나 본 적이 없다.",
    "art": "a hunting bow whose two limbs are a matched pair of pale branching stag antlers, joined at a simple wrapped grip with a taut dark string, quiet and wild, clearly a bow weapon, no text, large, diagonal",
    "wornDesc": "a hunting bow (a weapon) held in one hand, its two limbs a matched pair of pale branching stag antlers joined at a cord-wrapped grip, a taut dark bowstring drawn between the tips"
  },
  {
    "key": "druid_antler_staff",
    "slot": "weapon",
    "nameKo": "드루이드의 지팡이",
    "region": "일반",
    "tone": "희망",
    "lore": "뒤틀린 나무가 위로 갈수록 사슴뿔처럼 갈라지고, 그 갈래 한가운데 호박석 한 덩이가 얹혀 있다. 돌 안에는 아주 오래된 여름이 통째로 갇혀, 겨울 숲에서 이걸 짚으면 손끝부터 먼저 데워진다. 자루를 감은 이끼가 사철 푸른 것도 그 온기 때문이라고 한다.",
    "art": "a druid's tall staff crowned with branching stag antlers, moss and a single amber stone held in the fork, moss green and warm amber — ancient, gentle and grand",
    "wornDesc": "tall twisted dark-wood staff whose crown forks into branching stag antlers, a glowing amber stone cradled in the fork, green moss and vines wound down the shaft"
  },
  {
    "key": "oni_slayer_odachi",
    "slot": "weapon",
    "nameKo": "귀참의 대태도",
    "region": "일반",
    "tone": "화려",
    "lore": "검은 강철 날에 진홍 불꽃 문양이 흐르고, 날끝은 한 줄로 붉게 달아올라 있다. 코등이는 성난 도깨비 얼굴을 그대로 부어 만든 것인데, 벨 상대를 마주하면 그 얼굴이 먼저 이를 드러내며 웃는다. 베고 나면 언제 그랬냐는 듯 다시 무표정으로 돌아간다.",
    "art": "an oni slayer's massive odachi with a broken demon horn lashed to the hilt and a torn charm paper on the blade, lacquer black and hot vermilion — ferocious, heavy and magnificent",
    "wornDesc": "a very long odachi with a black steel blade veined with burning crimson flame patterns, its sharpened edge a bright glowing red-orange line running the full length, the iron guard cast as a snarling red oni demon face, a red cord-wrapped hilt ending in a plain dark pommel"
  },
  {
    "key": "druid_thorn_staff",
    "slot": "weapon",
    "nameKo": "장미 핀 가시 지팡이",
    "region": "일반",
    "tone": "전설",
    "lore": "검은 덤불이 여러 겹으로 꼬여 자루가 되고, 꼭대기에서 진홍 한 송이가 벌어져 있다. 늪을 건너려던 군세가 이 지팡이 하나에 막힌 적이 있다. 땅을 한 번 내리치자 발밑에서 가시덤불이 사람 키만큼 솟아, 앞줄은 물러설 자리조차 찾지 못했다. 이듬해 그 자리는 늪에서 장미가 가장 많이 피는 들이 됐다.",
    "art": "a wild druid's staff of twisting bramble bound in thorned briar with one deep red rose opening at the crown, bramble black and blood rose red — untamed, dangerous and beautiful",
    "wornDesc": "twisted black bramble staff bristling with thorns along its length, a deep red rose blooming at its crown"
  }
];
