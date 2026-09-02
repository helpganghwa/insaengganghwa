/**
 * 칭호 공개 정의 — 클라이언트 번들에 실린다. ⚠ 획득 조건 절대 금지(TITLES.md §3.5).
 * 조건·난이도는 defs.server.ts에만. 생성: bun run scripts/gen-title-defs.ts (수동 수정 금지)
 */
export type TitleKind = 'permanent' | 'conditional' | 'tribute';

export type TitleStyle = {
  color?: string;
  /** 지역 혼합 세트 — 정적 그라데이션. */
  gradient?: string[];
  /** 특별 이펙트(fx-*) / 파티클(pt-*) — components/title-fx.css. */
  fx?: string;
  pt?: string;
  /** 파티클 개수(기본 4). */
  pc?: number;
  /** 글자 단위 렌더 — 문자별 애니메이션. */
  split?: boolean;
  /** 어려움·한정 공통 은은한 발광. */
  glow?: boolean;
  /** 집행관 — ExecutorTag 렌더 위임. */
  executor?: boolean;
  /** 두 색 라벨 — 앞부분(text)을 별도 색으로(지역 주인: 지역명=지역색, 뒤=color). */
  prefix?: { text: string; color: string };
};

export type TitleDef = { code: string; kind: TitleKind; label: string; hidden: boolean; cat: string; style: TitleStyle };

export const TITLE_DEFS: TitleDef[] = [
 {
  code: "rank_combat",
  kind: "conditional",
  label: "가장 높은 망치",
  hidden: false,
  cat: "랭킹 1위",
  style: {
   fx: "goldflow",
   glow: true
  }
 },
 {
  code: "rank_max",
  kind: "conditional",
  label: "불의 정점",
  hidden: false,
  cat: "랭킹 1위",
  style: {
   fx: "emberflow",
   glow: true
  }
 },
 {
  code: "rank_sum",
  kind: "conditional",
  label: "강철의 군주",
  hidden: false,
  cat: "랭킹 1위",
  style: {
   fx: "steelshine",
   glow: true
  }
 },
 {
  code: "rank_raid",
  kind: "conditional",
  label: "토벌대장",
  hidden: false,
  cat: "랭킹 1위",
  style: {
   fx: "crimsonflow",
   glow: true
  }
 },
 {
  code: "rank_melee",
  kind: "conditional",
  label: "투기장의 왕",
  hidden: false,
  cat: "랭킹 1위",
  style: {
   fx: "violetflow",
   glow: true
  }
 },
 {
  code: "zone_executor",
  kind: "conditional",
  label: "{구역} 집행관",
  hidden: false,
  cat: "조건부",
  style: {
   executor: true
  }
 },
 {
  code: "melee_champion",
  kind: "conditional",
  label: "왕좌의 온기",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "goldglow",
   glow: true
  }
 },
 {
  code: "melee_shame",
  kind: "conditional",
  label: "와신상담",
  hidden: true,
  cat: "조건부",
  style: {
   color: "#cec6e0"
  }
 },
 {
  code: "raid_hero",
  kind: "conditional",
  label: "간밤의 영웅",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "rich_apex",
  kind: "conditional",
  label: "황금 왕좌",
  hidden: true,
  cat: "조건부",
  style: {
   fx: "goldglow",
   glow: true
  }
 },
 {
  code: "guild_top",
  kind: "conditional",
  label: "명가",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "staticazure",
   glow: true
  }
 },
 {
  code: "guild_flag",
  kind: "conditional",
  label: "수장",
  hidden: false,
  cat: "조건부",
  style: {
   color: "#cec6e0"
  }
 },
 {
  code: "broke_now",
  kind: "conditional",
  label: "빈털터리",
  hidden: true,
  cat: "조건부",
  style: {
   color: "#cec6e0"
  }
 },
 {
  code: "star_holder",
  kind: "conditional",
  label: "별의 주인",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "veilflow"
  }
 },
 {
  code: "full_armed",
  kind: "conditional",
  label: "완전 무장",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "veilflow"
  }
 },
 {
  code: "lib_first",
  kind: "permanent",
  label: "사슬을 끊은 자",
  hidden: false,
  cat: "해방",
  style: {
   color: "#c9a2f0"
  }
 },
 {
  code: "lib_holder",
  kind: "conditional",
  label: "해방자",
  hidden: false,
  cat: "해방",
  style: {
   color: "#c9a2f0"
  }
 },
 {
  code: "lib_ten",
  kind: "conditional",
  label: "지배자",
  hidden: false,
  cat: "해방",
  style: {
   fx: "freedomglint"
  }
 },
 {
  code: "champ_5",
  kind: "conditional",
  label: "정복자",
  hidden: false,
  cat: "해방",
  style: {
   fx: "violetflow"
  }
 },
 {
  code: "enhance_100",
  kind: "permanent",
  label: "백 번째 불꽃",
  hidden: false,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "enhance_200",
  kind: "permanent",
  label: "별에 닿은 망치",
  hidden: false,
  cat: "강화",
  style: {
   fx: "starlight",
   pt: "stardust",
   glow: true
  }
 },
 {
  code: "win_streak",
  kind: "permanent",
  label: "승승장구",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_streak",
  kind: "permanent",
  label: "그런 날이 있다",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_10",
  kind: "permanent",
  label: "바닥 밑에 바닥",
  hidden: true,
  cat: "강화",
  style: {
   fx: "forgeshine"
  }
 },
 {
  code: "hold_streak",
  kind: "permanent",
  label: "요지부동",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "hold_20",
  kind: "permanent",
  label: "만년설",
  hidden: true,
  cat: "강화",
  style: {
   fx: "emberflow"
  }
 },
 {
  code: "phoenix",
  kind: "permanent",
  label: "오뚝이",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "double_joy",
  kind: "permanent",
  label: "겹경사",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "lucky_hammer",
  kind: "permanent",
  label: "행운의 망치",
  hidden: false,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_curse",
  kind: "permanent",
  label: "저주받은 손",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "enhance_10000",
  kind: "permanent",
  label: "무쇠팔",
  hidden: false,
  cat: "강화",
  style: {
   fx: "emboss",
   glow: true
  }
 },
 {
  code: "one_well",
  kind: "permanent",
  label: "한 우물",
  hidden: true,
  cat: "강화",
  style: {
   fx: "emberflow"
  }
 },
 {
  code: "five_min",
  kind: "permanent",
  label: "화로의 파수꾼",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "aging",
  kind: "permanent",
  label: "잊혀진 불씨",
  hidden: true,
  cat: "강화",
  style: {
   fx: "breath"
  }
 },
 {
  code: "balance_master",
  kind: "conditional",
  label: "삼위일체",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "owl",
  kind: "permanent",
  label: "올빼미",
  hidden: true,
  cat: "시간대",
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "early_bird",
  kind: "permanent",
  label: "아침형 인간",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "weekend",
  kind: "permanent",
  label: "주말 출근",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "monday",
  kind: "permanent",
  label: "월요병",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "friday",
  kind: "permanent",
  label: "불타는 금요일",
  hidden: true,
  cat: "시간대",
  style: {
   fx: "nightstar"
  }
 },
 {
  code: "supply_binge",
  kind: "permanent",
  label: "수확의 날",
  hidden: false,
  cat: "보급",
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "supply_5000",
  kind: "permanent",
  label: "보급왕",
  hidden: false,
  cat: "보급",
  style: {
   fx: "honeyflow"
  }
 },
 {
  code: "supply_10000",
  kind: "permanent",
  label: "만물상",
  hidden: false,
  cat: "보급",
  style: {
   fx: "honeyflow"
  }
 },
 {
  code: "same_pull",
  kind: "permanent",
  label: "데자뷔",
  hidden: true,
  cat: "보급",
  style: {
   color: "#b9b198"
  }
 },
 {
  code: "transcend_300",
  kind: "permanent",
  label: "경계 너머",
  hidden: false,
  cat: "초월",
  style: {
   color: "#b39ddb"
  }
 },
 {
  code: "transcend_1000",
  kind: "permanent",
  label: "초월자",
  hidden: false,
  cat: "초월",
  style: {
   fx: "stardrift"
  }
 },
 {
  code: "transcend_deep",
  kind: "permanent",
  label: "별을 넘는 자",
  hidden: false,
  cat: "초월",
  style: {
   fx: "violetglow",
   pt: "vstar",
   glow: true
  }
 },
 {
  code: "star_rain",
  kind: "permanent",
  label: "쏟아지는 별",
  hidden: true,
  cat: "초월",
  style: {
   fx: "astralflow"
  }
 },
 {
  code: "codex_120",
  kind: "permanent",
  label: "마지막 페이지",
  hidden: false,
  cat: "도감",
  style: {
   fx: "goldleaf",
   glow: true
  }
 },
 {
  code: "raid_strike",
  kind: "permanent",
  label: "산을 가른 일격",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "crimsonflow"
  }
 },
 {
  code: "raid_365",
  kind: "permanent",
  label: "끝없는 원정",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "warbanner"
  }
 },
 {
  code: "raid_volcano",
  kind: "permanent",
  label: "불을 삼킨 자",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "emberflow",
   pt: "ember",
   glow: true
  }
 },
 {
  code: "raid_temple",
  kind: "permanent",
  label: "서리 사냥꾼",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "iceflow",
   pt: "snow",
   glow: true
  }
 },
 {
  code: "raid_swamp",
  kind: "permanent",
  label: "늪의 공포",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "slimeflow",
   pt: "slime",
   glow: true
  }
 },
 {
  code: "raid_orc",
  kind: "permanent",
  label: "부락의 악몽",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "duststatic",
   pt: "drum",
   glow: true
  }
 },
 {
  code: "raid_fallen",
  kind: "permanent",
  label: "날개 사냥꾼",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "ashstatic",
   pt: "feather",
   glow: true
  }
 },
 {
  code: "raid_kingdom",
  kind: "permanent",
  label: "왕국의 방패",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "goldglow",
   pt: "stardust",
   glow: true
  }
 },
 {
  code: "melee_first_win",
  kind: "permanent",
  label: "투신",
  hidden: false,
  cat: "대난투",
  style: {
   fx: "duelflow"
  }
 },
 {
  code: "melee_30_win",
  kind: "permanent",
  label: "패왕",
  hidden: false,
  cat: "대난투",
  style: {
   fx: "crimsonflow",
   glow: true
  }
 },
 {
  code: "melee_3streak",
  kind: "permanent",
  label: "왕조",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "goldglow",
   glow: true
  }
 },
 {
  code: "melee_top10",
  kind: "permanent",
  label: "백전노장",
  hidden: false,
  cat: "대난투",
  style: {
   fx: "duelflow"
  }
 },
 {
  code: "melee_podium",
  kind: "permanent",
  label: "정상권",
  hidden: false,
  cat: "대난투",
  style: {
   fx: "bloodpulse"
  }
 },
 {
  code: "melee_30",
  kind: "permanent",
  label: "역전의 용사",
  hidden: false,
  cat: "대난투",
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "melee_comet",
  kind: "permanent",
  label: "혜성",
  hidden: true,
  cat: "대난투",
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "melee_last",
  kind: "permanent",
  label: "꼴찌의 품격",
  hidden: true,
  cat: "대난투",
  style: {
   color: "#dab1b9"
  }
 },
 {
  code: "kong_line",
  kind: "permanent",
  label: "2인자",
  hidden: true,
  cat: "대난투",
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "tax_collector",
  kind: "permanent",
  label: "징수관",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "siege_30",
  kind: "permanent",
  label: "공성의 선봉",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "wall",
  kind: "permanent",
  label: "성벽",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "tour_lord",
  kind: "permanent",
  label: "순회 영주",
  hidden: true,
  cat: "점령전",
  style: {
   fx: "verdigris"
  }
 },
 {
  code: "guild_founder",
  kind: "permanent",
  label: "첫 깃발",
  hidden: false,
  cat: "길드",
  style: {
   color: "#d5c1a0"
  }
 },
 {
  code: "guild_donate",
  kind: "permanent",
  label: "아낌없는 손",
  hidden: false,
  cat: "길드",
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "no_guild_30",
  kind: "conditional",
  label: "무소속",
  hidden: true,
  cat: "길드",
  style: {
   fx: "breath"
  }
 },
 {
  code: "friends_30",
  kind: "permanent",
  label: "마당발",
  hidden: false,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "invite_1",
  kind: "permanent",
  label: "두 번째 발자국",
  hidden: false,
  cat: "소셜",
  style: {
   fx: "pearl"
  }
 },
 {
  code: "invite_5",
  kind: "permanent",
  label: "길잡이",
  hidden: false,
  cat: "소셜",
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "invite_20",
  kind: "permanent",
  label: "모병관",
  hidden: false,
  cat: "소셜",
  style: {
   fx: "crimsonflow",
   glow: true
  }
 },
 {
  code: "invite_50",
  kind: "permanent",
  label: "길이 된 사람",
  hidden: false,
  cat: "소셜",
  style: {
   fx: "imperial",
   glow: true
  }
 },
 {
  code: "school_founder",
  kind: "permanent",
  label: "학파의 시조",
  hidden: true,
  cat: "소셜",
  style: {
   fx: "inkwash",
   glow: true
  }
 },
 {
  code: "sprout_scout",
  kind: "permanent",
  label: "떡잎 감별사",
  hidden: true,
  cat: "소셜",
  style: {
   fx: "verdantflow",
   pt: "spark",
   glow: true
  }
 },
 {
  code: "chat_1000",
  kind: "permanent",
  label: "수다쟁이",
  hidden: true,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "mention_100",
  kind: "permanent",
  label: "대륙의 스타",
  hidden: true,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "checkin_30",
  kind: "permanent",
  label: "개근상",
  hidden: false,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "checkin_365",
  kind: "permanent",
  label: "사계절의 망치",
  hidden: true,
  cat: "일상",
  style: {
   fx: "mistdrift"
  }
 },
 {
  code: "mail_1000",
  kind: "permanent",
  label: "우편함 지기",
  hidden: false,
  cat: "일상",
  style: {
   fx: "driftfall"
  }
 },
 {
  code: "resident_10",
  kind: "permanent",
  label: "지박령",
  hidden: true,
  cat: "일상",
  style: {
   color: "#b9b9bd"
  }
 },
 {
  code: "mover_30",
  kind: "permanent",
  label: "역마살",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "time_gold",
  kind: "permanent",
  label: "시간은 금",
  hidden: true,
  cat: "재화",
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "lucky_777",
  kind: "permanent",
  label: "럭키 세븐",
  hidden: true,
  cat: "재화",
  style: {
   fx: "goldsoft"
  }
 },
 {
  code: "power_77777",
  kind: "permanent",
  label: "칠칠한 대장장이",
  hidden: true,
  cat: "재화",
  style: {
   fx: "gildedflow"
  }
 },
 {
  code: "dragon_hoard",
  kind: "permanent",
  label: "자린고비",
  hidden: true,
  cat: "재화",
  style: {
   fx: "goldglow"
  }
 },
 {
  code: "pay_first",
  kind: "permanent",
  label: "첫 후원",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron1"
  }
 },
 {
  code: "pay_5",
  kind: "permanent",
  label: "기사 후원자",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron2"
  }
 },
 {
  code: "pay_20",
  kind: "permanent",
  label: "영주 후원자",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron3",
   pt: "pstar",
   pc: 1
  }
 },
 {
  code: "pay_50",
  kind: "permanent",
  label: "왕실 후원자",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron4",
   pt: "pstar",
   pc: 2,
   glow: true
  }
 },
 {
  code: "pay_200",
  kind: "permanent",
  label: "왕국의 기둥",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron5",
   pt: "pstar",
   pc: 3,
   glow: true
  }
 },
 {
  code: "pay_500",
  kind: "permanent",
  label: "화로의 수호자",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron6",
   pt: "pstar",
   pc: 4,
   split: true,
   glow: true
  }
 },
 {
  code: "pay_1000",
  kind: "permanent",
  label: "영원의 불꽃",
  hidden: false,
  cat: "후원",
  style: {
   fx: "patron7",
   pt: "pember",
   pc: 6,
   split: true,
   glow: true
  }
 },
 {
  code: "two_mirrors",
  kind: "permanent",
  label: "두 개의 거울",
  hidden: true,
  cat: "아바타",
  style: {
   color: "#d9bed1"
  }
 },
 {
  code: "same_face_30",
  kind: "permanent",
  label: "한결같은 얼굴",
  hidden: true,
  cat: "아바타",
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "same_combo",
  kind: "permanent",
  label: "필연",
  hidden: true,
  cat: "아바타",
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "avatar_50",
  kind: "permanent",
  label: "왕실 의상실",
  hidden: false,
  cat: "아바타",
  style: {
   fx: "roseflow"
  }
 },
 {
  code: "avatar_1000",
  kind: "permanent",
  label: "천의 얼굴",
  hidden: true,
  cat: "아바타",
  style: {
   fx: "pearl",
   glow: true
  }
 },
 {
  code: "full_course",
  kind: "permanent",
  label: "알찬 하루",
  hidden: true,
  cat: "조합",
  style: {
   color: "#a2c8c4"
  }
 },
 {
  code: "pentagon",
  kind: "permanent",
  label: "오관왕",
  hidden: true,
  cat: "조합",
  style: {
   fx: "pentaflow",
   glow: true
  }
 },
 {
  code: "apex_shoot",
  kind: "permanent",
  label: "전성기의 초상",
  hidden: true,
  cat: "조합",
  style: {
   fx: "tideflow"
  }
 },
 {
  code: "kintsugi_master",
  kind: "conditional",
  label: "흑금의 주인",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "starfield_master",
  kind: "conditional",
  label: "별자리를 쥔 손",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "nightstar",
   pt: "stardust",
   glow: true
  }
 },
 {
  code: "frog_prince",
  kind: "conditional",
  label: "개구리 왕자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "true_witch",
  kind: "conditional",
  label: "진짜 마녀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "winter_itself",
  kind: "conditional",
  label: "겨울의 화신",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "dawn_knight",
  kind: "conditional",
  label: "여명의 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "dragon_heir",
  kind: "conditional",
  label: "용의 후예",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "crown_touch",
  kind: "permanent",
  label: "화룡점정",
  hidden: true,
  cat: "강화",
  style: {
   fx: "emberflow"
  }
 },
 {
  code: "lightning",
  kind: "permanent",
  label: "번갯불",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "pure_way",
  kind: "permanent",
  label: "정공법",
  hidden: false,
  cat: "강화",
  style: {
   fx: "forgeshine"
  }
 },
 {
  code: "enhance_1000",
  kind: "permanent",
  label: "천리길",
  hidden: false,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "beginner_mind",
  kind: "permanent",
  label: "초심",
  hidden: true,
  cat: "강화",
  style: {
   fx: "emberflow"
  }
 },
 {
  code: "blitz",
  kind: "permanent",
  label: "속전속결",
  hidden: true,
  cat: "강화",
  style: {
   fx: "forgeshine"
  }
 },
 {
  code: "fire_play",
  kind: "permanent",
  label: "불장난",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "curse_of_9",
  kind: "permanent",
  label: "9의 저주",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "eclipse",
  kind: "permanent",
  label: "별의 끝",
  hidden: false,
  cat: "초월",
  style: {
   fx: "starlight"
  }
 },
 {
  code: "galaxy",
  kind: "permanent",
  label: "은하수",
  hidden: false,
  cat: "초월",
  style: {
   fx: "milkyway",
   glow: true
  }
 },
 {
  code: "vanguard",
  kind: "permanent",
  label: "선봉장",
  hidden: true,
  cat: "레이드",
  style: {
   color: "#d88c8c"
  }
 },
 {
  code: "continent_sweep",
  kind: "permanent",
  label: "대륙 토벌",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "crimsonflow"
  }
 },
 {
  code: "iron_man",
  kind: "permanent",
  label: "철인",
  hidden: false,
  cat: "대난투",
  style: {
   fx: "emboss",
   glow: true
  }
 },
 {
  code: "sprint",
  kind: "permanent",
  label: "질주",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "duelflow"
  }
 },
 {
  code: "ram",
  kind: "permanent",
  label: "공성추",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "iron_wall",
  kind: "permanent",
  label: "철옹성",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "bronzeshine"
  }
 },
 {
  code: "witness",
  kind: "permanent",
  label: "터줏대감",
  hidden: false,
  cat: "길드",
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "homecoming",
  kind: "permanent",
  label: "귀향",
  hidden: true,
  cat: "길드",
  style: {
   color: "#d5c1a0"
  }
 },
 {
  code: "pillar",
  kind: "permanent",
  label: "대들보",
  hidden: false,
  cat: "길드",
  style: {
   fx: "royalflow"
  }
 },
 {
  code: "surpassed",
  kind: "permanent",
  label: "청출어람",
  hidden: true,
  cat: "소셜",
  style: {
   fx: "jade",
   glow: true
  }
 },
 {
  code: "welcome_crowd",
  kind: "permanent",
  label: "후견인",
  hidden: true,
  cat: "소셜",
  style: {
   fx: "candle",
   glow: true
  }
 },
 {
  code: "night_talk",
  kind: "permanent",
  label: "밤의 수다",
  hidden: true,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "comeback",
  kind: "permanent",
  label: "휴가 복귀",
  hidden: true,
  cat: "일상",
  style: {
   color: "#b9b9bd"
  }
 },
 {
  code: "time_capsule",
  kind: "permanent",
  label: "연륜",
  hidden: false,
  cat: "일상",
  style: {
   fx: "mistdrift"
  }
 },
 {
  code: "bottomless",
  kind: "permanent",
  label: "큰손",
  hidden: true,
  cat: "재화",
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "billionaire",
  kind: "permanent",
  label: "백만장자",
  hidden: false,
  cat: "재화",
  style: {
   fx: "gildedflow"
  }
 },
 {
  code: "rebirth",
  kind: "permanent",
  label: "환골탈태",
  hidden: true,
  cat: "아바타",
  style: {
   fx: "blushbreath"
  }
 },
 {
  code: "one_suit",
  kind: "permanent",
  label: "단벌 신사",
  hidden: true,
  cat: "아바타",
  style: {
   fx: "roseflow"
  }
 },
 {
  code: "disguise",
  kind: "permanent",
  label: "변장술사",
  hidden: false,
  cat: "아바타",
  style: {
   fx: "blushbreath"
  }
 },
 {
  code: "model_student",
  kind: "conditional",
  label: "모범생",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#d8b865"
  }
 },
 {
  code: "night_noble",
  kind: "conditional",
  label: "밤의 귀족",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "valkyrie",
  kind: "conditional",
  label: "발키리",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "grim_envoy",
  kind: "conditional",
  label: "명부의 사자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#c084fc"
   ]
  }
 },
 {
  code: "archangel",
  kind: "conditional",
  label: "대천사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "aurora"
  }
 },
 {
  code: "outlaw",
  kind: "conditional",
  label: "무법자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "armory_lord",
  kind: "conditional",
  label: "병기고의 주인",
  hidden: false,
  cat: "해방",
  style: {
   fx: "chrome",
   glow: true
  }
 },
 {
  code: "throne_shadow",
  kind: "conditional",
  label: "왕좌의 그림자",
  hidden: true,
  cat: "랭킹 1위",
  style: {
   fx: "silverglow",
   glow: true
  }
 },
 {
  code: "sword_and_pen",
  kind: "permanent",
  label: "문무겸비",
  hidden: false,
  cat: "조합",
  style: {
   fx: "tidewave"
  }
 },
 {
  code: "enhance_150",
  kind: "permanent",
  label: "성층권",
  hidden: false,
  cat: "강화",
  style: {
   fx: "cinderflow"
  }
 },
 {
  code: "morning_ration",
  kind: "permanent",
  label: "아침 배급",
  hidden: true,
  cat: "보급",
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "three_meals",
  kind: "permanent",
  label: "삼시세끼",
  hidden: true,
  cat: "보급",
  style: {
   fx: "honeydrip"
  }
 },
 {
  code: "assault_100",
  kind: "permanent",
  label: "돌격대장",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "bronzeshine"
  }
 },
 {
  code: "guardian_100",
  kind: "permanent",
  label: "수호신",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "verdigris"
  }
 },
 {
  code: "raid_100days",
  kind: "permanent",
  label: "백일 원정",
  hidden: true,
  cat: "레이드",
  style: {
   fx: "crimsonflow"
  }
 },
 {
  code: "winter_blade",
  kind: "conditional",
  label: "겨울 검객",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "iceflow",
   pt: "snow",
   glow: true
  }
 },
 {
  code: "volcano_heart",
  kind: "conditional",
  label: "화산의 심장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "emberflow",
   pt: "ember",
   glow: true
  }
 },
 {
  code: "lotus_warrior",
  kind: "conditional",
  label: "연꽃 무사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "star_mage",
  kind: "conditional",
  label: "별의 마술사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "thunder_emperor",
  kind: "conditional",
  label: "뇌제",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "sparkstatic",
   pt: "spark",
   glow: true
  }
 },
 {
  code: "one_shot",
  kind: "conditional",
  label: "단 한 발",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "blue_sky",
  kind: "conditional",
  label: "창천",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#d8b865"
  }
 },
 {
  code: "phoenix_archer",
  kind: "conditional",
  label: "불사조",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "shaman",
  kind: "conditional",
  label: "주술사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "angler",
  kind: "conditional",
  label: "강태공",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#4cb974"
  }
 },
 {
  code: "paladin",
  kind: "conditional",
  label: "성기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "astrologer",
  kind: "conditional",
  label: "점성술사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "masquerade",
  kind: "conditional",
  label: "가면무도회",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "headmaster",
  kind: "conditional",
  label: "학장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#d8b865"
  }
 },
 {
  code: "coronation",
  kind: "conditional",
  label: "대관식",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "perpetual",
  kind: "permanent",
  label: "꺼지지 않는 불",
  hidden: false,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "new_record",
  kind: "permanent",
  label: "신기록",
  hidden: true,
  cat: "강화",
  style: {
   fx: "flame"
  }
 },
 {
  code: "cliff_edge",
  kind: "permanent",
  label: "절벽 끝에서",
  hidden: true,
  cat: "강화",
  style: {
   fx: "flame"
  }
 },
 {
  code: "flawless_100",
  kind: "permanent",
  label: "백발백중",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "midnight_snack",
  kind: "permanent",
  label: "야식",
  hidden: true,
  cat: "보급",
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "meteor_shower",
  kind: "permanent",
  label: "유성우",
  hidden: true,
  cat: "초월",
  style: {
   color: "#b39ddb"
  }
 },
 {
  code: "month_war",
  kind: "permanent",
  label: "불굴",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "bloodpulse"
  }
 },
 {
  code: "fire_support",
  kind: "permanent",
  label: "지원 사격",
  hidden: true,
  cat: "레이드",
  style: {
   color: "#d88c8c"
  }
 },
 {
  code: "initiation",
  kind: "permanent",
  label: "신고식",
  hidden: false,
  cat: "아바타",
  style: {
   color: "#d9bed1"
  }
 },
 {
  code: "dust_to_mountain",
  kind: "permanent",
  label: "티끌 모아 태산",
  hidden: false,
  cat: "재화",
  style: {
   fx: "coinshine"
  }
 },
 {
  code: "old_friend",
  kind: "permanent",
  label: "죽마고우",
  hidden: true,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "streak_king",
  kind: "conditional",
  label: "개근왕",
  hidden: false,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "frog_sniper",
  kind: "conditional",
  label: "개구리 저격수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "gentleman",
  kind: "conditional",
  label: "신사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "cupid",
  kind: "conditional",
  label: "큐피드",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "hunter",
  kind: "conditional",
  label: "사냥꾼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "twin_saber",
  kind: "conditional",
  label: "쌍검객",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "standard_bearer",
  kind: "conditional",
  label: "기수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "ash_reaper",
  kind: "conditional",
  label: "재의 수확자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "dusk",
  kind: "conditional",
  label: "황혼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "duskfade"
  }
 },
 {
  code: "sky_knight",
  kind: "conditional",
  label: "창공의 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "dragon_slayer",
  kind: "conditional",
  label: "용살자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "shadow",
  kind: "conditional",
  label: "그림자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "forge_heart",
  kind: "conditional",
  label: "화심",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "grim_reaper",
  kind: "conditional",
  label: "사신",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "necromancer",
  kind: "conditional",
  label: "강령술사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "morning_blade",
  kind: "conditional",
  label: "아침의 검",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "twin_wings",
  kind: "conditional",
  label: "쌍익",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "yinyang",
   glow: true
  }
 },
 {
  code: "wanderer",
  kind: "conditional",
  label: "유랑자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "little_angel",
  kind: "conditional",
  label: "꼬마 천사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "lily_spirit",
  kind: "conditional",
  label: "수련의 정령",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "fire_dancer",
  kind: "conditional",
  label: "불의 무희",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "beast_king",
  kind: "conditional",
  label: "야수의 왕",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "royal_guard",
  kind: "conditional",
  label: "근위대장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "rising_star",
  kind: "conditional",
  label: "신흥 강자",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "lunarflow"
  }
 },
 {
  code: "big_family",
  kind: "conditional",
  label: "대가족",
  hidden: false,
  cat: "조건부",
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "top_patron",
  kind: "conditional",
  label: "재상",
  hidden: true,
  cat: "조건부",
  style: {
   fx: "imperial",
   glow: true
  }
 },
 {
  code: "doremi",
  kind: "permanent",
  label: "도레미",
  hidden: true,
  cat: "재화",
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "army_100k",
  kind: "permanent",
  label: "만부부당",
  hidden: false,
  cat: "재화",
  style: {
   fx: "coinshine"
  }
 },
 {
  code: "seven_falls",
  kind: "permanent",
  label: "칠전팔기",
  hidden: true,
  cat: "강화",
  style: {
   fx: "flame"
  }
 },
 {
  code: "reincarnation",
  kind: "permanent",
  label: "환생",
  hidden: true,
  cat: "강화",
  style: {
   fx: "cinderflow"
  }
 },
 {
  code: "insomnia",
  kind: "permanent",
  label: "불면증",
  hidden: true,
  cat: "시간대",
  style: {
   fx: "neon",
   glow: true
  }
 },
 {
  code: "night_watch",
  kind: "permanent",
  label: "야간 경비",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "weekend_raid",
  kind: "permanent",
  label: "주말 원정대",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "king_return",
  kind: "permanent",
  label: "왕의 귀환",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "duelflow"
  }
 },
 {
  code: "big_eater",
  kind: "permanent",
  label: "우편 홍수",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "triathlon",
  kind: "permanent",
  label: "철인 3종",
  hidden: true,
  cat: "조합",
  style: {
   color: "#80cbc4"
  }
 },
 {
  code: "seraph",
  kind: "conditional",
  label: "세라핌",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "black_knight",
  kind: "conditional",
  label: "흑기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "field_marshal",
  kind: "conditional",
  label: "대원수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "snow_priest",
  kind: "conditional",
  label: "설야의 사제",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "firebird",
  kind: "conditional",
  label: "불새",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "forest_keeper",
  kind: "conditional",
  label: "숲지기",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "star_reader",
  kind: "conditional",
  label: "별을 읽는 자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "penitent",
  kind: "conditional",
  label: "속죄자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "bog_warden",
  kind: "conditional",
  label: "늪의 파수꾼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "ascetic",
  kind: "conditional",
  label: "수행자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lion_knight",
  kind: "conditional",
  label: "사자 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "herald",
  kind: "conditional",
  label: "전령",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "bog_witch",
  kind: "conditional",
  label: "늪마녀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "self_saint",
  kind: "conditional",
  label: "자칭 성자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lava_dancer",
  kind: "conditional",
  label: "화염 무도",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "vampire",
  kind: "conditional",
  label: "흡혈귀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lantern_keeper",
  kind: "conditional",
  label: "등불지기",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "herbalist",
  kind: "conditional",
  label: "약초꾼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#4cb974"
  }
 },
 {
  code: "little_devil",
  kind: "conditional",
  label: "꼬마 악마",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "drunkard",
  kind: "conditional",
  label: "가득 찬 잔",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#d48c59"
  }
 },
 {
  code: "feather_style",
  kind: "conditional",
  label: "깃털 단장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "one_eye",
  kind: "conditional",
  label: "외눈 검객",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "trumpeter",
  kind: "conditional",
  label: "나팔수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "drummer",
  kind: "conditional",
  label: "북재비",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "court_dancer",
  kind: "conditional",
  label: "궁중 무희",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "tribal_banner",
  kind: "conditional",
  label: "부족의 기수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "mechanic",
  kind: "conditional",
  label: "정비공",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "ice_heart",
  kind: "conditional",
  label: "얼음 심장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "iron_fist",
  kind: "conditional",
  label: "강철 주먹",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "lion_heart",
  kind: "conditional",
  label: "사자의 심장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "fur_collar",
  kind: "conditional",
  label: "설백",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "incense_keeper",
  kind: "conditional",
  label: "향지기",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "dragon_face",
  kind: "conditional",
  label: "용의 얼굴",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "snow_monk",
  kind: "conditional",
  label: "설산 수도승",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "fallen_priest",
  kind: "conditional",
  label: "타락 사제",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "volcano_smith",
  kind: "conditional",
  label: "화산 대장장이",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "thunder_general",
  kind: "conditional",
  label: "뇌운의 장군",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "sparkstatic",
   pt: "spark",
   glow: true
  }
 },
 {
  code: "night_visitor",
  kind: "conditional",
  label: "밤손님",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "honor_student",
  kind: "conditional",
  label: "우등생",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#d8b865"
  }
 },
 {
  code: "fluffy_cloud",
  kind: "conditional",
  label: "뭉게구름",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#cfb3eb"
  }
 },
 {
  code: "frog_person",
  kind: "conditional",
  label: "개구리 인간",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#4cb974"
  }
 },
 {
  code: "peddler",
  kind: "conditional",
  label: "보부상",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "flower_crown",
  kind: "conditional",
  label: "화관",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#4cb974"
  }
 },
 {
  code: "pointy_hat",
  kind: "conditional",
  label: "뾰족 모자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "bookworm",
  kind: "conditional",
  label: "책벌레",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ced4f2"
  }
 },
 {
  code: "firefly",
  kind: "conditional",
  label: "반딧불",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#4cb974"
  }
 },
 {
  code: "azure_knight",
  kind: "conditional",
  label: "쪽빛 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "pumpkin_glow",
  kind: "conditional",
  label: "호박등",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "old_professor",
  kind: "conditional",
  label: "노교수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "silence",
  kind: "conditional",
  label: "침묵",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "lily_pad",
  kind: "conditional",
  label: "수련잎",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "ball_night",
  kind: "conditional",
  label: "무도회의 밤",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "silk"
  }
 },
 {
  code: "white_feather",
  kind: "conditional",
  label: "하얀 깃",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "hourglass",
  kind: "conditional",
  label: "모래시계",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "ancestor",
  kind: "conditional",
  label: "조상님",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "star_gazer",
  kind: "conditional",
  label: "별점",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "nomad_fox",
  kind: "conditional",
  label: "사막 여우",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "red_night",
  kind: "conditional",
  label: "붉은 밤",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "raven",
  kind: "conditional",
  label: "갈까마귀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "starlight_cloak",
  kind: "conditional",
  label: "별빛 망토",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "snow_flower",
  kind: "conditional",
  label: "설화",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "frostedge"
  }
 },
 {
  code: "fire_dragon",
  kind: "conditional",
  label: "화룡",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "obsidian",
  kind: "conditional",
  label: "흑요",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "radiance",
  kind: "conditional",
  label: "광휘",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "ember_silk",
  kind: "conditional",
  label: "화문",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "battle_wings",
  kind: "conditional",
  label: "전장의 날개",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "holy_light",
  kind: "conditional",
  label: "성광",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "black_dragon",
  kind: "conditional",
  label: "흑룡",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "archangel_chief",
  kind: "conditional",
  label: "천사장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "aurora"
  }
 },
 {
  code: "forest_hermit",
  kind: "conditional",
  label: "숲의 은둔자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#22c55e",
    "#f97316"
   ]
  }
 },
 {
  code: "carefree",
  kind: "permanent",
  label: "천하태평",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "fast_courier",
  kind: "permanent",
  label: "신속 배달",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "all_in",
  kind: "permanent",
  label: "올인",
  hidden: true,
  cat: "재화",
  style: {
   fx: "goldglow"
  }
 },
 {
  code: "completionist",
  kind: "permanent",
  label: "완주",
  hidden: false,
  cat: "조합",
  style: {
   color: "#80cbc4"
  }
 },
 {
  code: "evening_life",
  kind: "permanent",
  label: "황금 시간대",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "commuter",
  kind: "permanent",
  label: "출퇴근",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "day_100_party",
  kind: "permanent",
  label: "백일잔치",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "sprout_keeper",
  kind: "permanent",
  label: "새싹 지킴이",
  hidden: true,
  cat: "소셜",
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "open_king",
  kind: "conditional",
  label: "개봉왕",
  hidden: true,
  cat: "조건부",
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "march_live",
  kind: "conditional",
  label: "진군",
  hidden: false,
  cat: "조건부",
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "smooth_sail",
  kind: "conditional",
  label: "순풍",
  hidden: true,
  cat: "조건부",
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "alley_boss",
  kind: "conditional",
  label: "골목대장",
  hidden: true,
  cat: "조건부",
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "red_ball",
  kind: "conditional",
  label: "붉은 무도회",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "silk"
  }
 },
 {
  code: "gunslinger",
  kind: "conditional",
  label: "황야의 총잡이",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "phantom_thief",
  kind: "conditional",
  label: "괴도",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "star_navigator",
  kind: "conditional",
  label: "별의 항해사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "nightstar",
   pt: "stardust",
   glow: true
  }
 },
 {
  code: "forest_witch",
  kind: "conditional",
  label: "숲의 마녀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "lava_lord",
  kind: "conditional",
  label: "용암 군주",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "emberflow",
   pt: "ember",
   glow: true
  }
 },
 {
  code: "gardener",
  kind: "conditional",
  label: "정원사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "kings_blade",
  kind: "conditional",
  label: "왕의 검",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "marksman",
  kind: "conditional",
  label: "명포수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "elite_few",
  kind: "conditional",
  label: "소수정예",
  hidden: false,
  cat: "조건부",
  style: {
   fx: "lunarflow"
  }
 },
 {
  code: "david",
  kind: "permanent",
  label: "다윗",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "bloodpulse"
  }
 },
 {
  code: "all_nighter",
  kind: "permanent",
  label: "밤샘 작업",
  hidden: true,
  cat: "시간대",
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "flawless_all",
  kind: "permanent",
  label: "대업",
  hidden: false,
  cat: "조합",
  style: {
   fx: "staticgold",
   glow: true
  }
 },
 {
  code: "longevity",
  kind: "permanent",
  label: "살아있는 역사",
  hidden: true,
  cat: "일상",
  style: {
   fx: "linenflow"
  }
 },
 {
  code: "paper_thin",
  kind: "permanent",
  label: "종이 한 장",
  hidden: true,
  cat: "대난투",
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "card_shark",
  kind: "permanent",
  label: "신들린 손",
  hidden: true,
  cat: "강화",
  style: {
   fx: "cinderflow"
  }
 },
 {
  code: "dawn_prayer",
  kind: "conditional",
  label: "새벽 기도",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "phoenix_set",
  kind: "conditional",
  label: "봉황",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "abyss_lord",
  kind: "conditional",
  label: "심연의 군주",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "abyssglow",
   pt: "abyss",
   glow: true
  }
 },
 {
  code: "silver_knight",
  kind: "conditional",
  label: "백은 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "marsh_patrol",
  kind: "conditional",
  label: "습지 순찰대",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "light_maiden",
  kind: "conditional",
  label: "빛의 무녀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "aurora"
  }
 },
 {
  code: "warpath",
  kind: "conditional",
  label: "패도",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "bloodpulse",
   pt: "ember",
   glow: true
  }
 },
 {
  code: "festival_night",
  kind: "conditional",
  label: "축제의 밤",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "night_walk",
  kind: "conditional",
  label: "야행",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "obsidian"
  }
 },
 {
  code: "glacier_knight",
  kind: "conditional",
  label: "빙하 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   fx: "iceflow",
   pt: "snow",
   glow: true
  }
 },
 {
  code: "steppe_wind",
  kind: "conditional",
  label: "초원의 바람",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "court_mage",
  kind: "conditional",
  label: "궁정 마법사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "ash_judge",
  kind: "conditional",
  label: "재의 심판자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "treasure_hunt",
  kind: "permanent",
  label: "보물찾기",
  hidden: true,
  cat: "조합",
  style: {
   fx: "tideflow"
  }
 },
 {
  code: "medal_collector",
  kind: "permanent",
  label: "훈장 수집가",
  hidden: false,
  cat: "조합",
  style: {
   fx: "royalflow",
   glow: true
  }
 },
 {
  code: "wandering_smith",
  kind: "permanent",
  label: "방랑 대장장이",
  hidden: true,
  cat: "일상",
  style: {
   fx: "linenflow"
  }
 },
 {
  code: "uncrowned",
  kind: "conditional",
  label: "무관의 제왕",
  hidden: true,
  cat: "조건부",
  style: {
   fx: "steelshine",
   glow: true
  }
 },
 {
  code: "fire_and_ice",
  kind: "conditional",
  label: "얼음과 불",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#60a5fa"
   ],
   glow: true
  }
 },
 {
  code: "heaven_knight",
  kind: "conditional",
  label: "하늘의 기사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "steam",
  kind: "conditional",
  label: "수증기",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#22c55e"
   ]
  }
 },
 {
  code: "frozen_marsh",
  kind: "conditional",
  label: "얼어붙은 늪",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#60a5fa",
    "#22c55e"
   ]
  }
 },
 {
  code: "savage_noble",
  kind: "conditional",
  label: "야만과 문명",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#fbbf24"
   ]
  }
 },
 {
  code: "foreign_god",
  kind: "conditional",
  label: "이방의 신",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#c084fc"
   ],
   glow: true
  }
 },
 {
  code: "dragon_crown",
  kind: "conditional",
  label: "용과 왕관",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#fbbf24"
   ],
   glow: true
  }
 },
 {
  code: "transfer_student",
  kind: "conditional",
  label: "전학생",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#22c55e",
    "#fbbf24"
   ]
  }
 },
 {
  code: "ash_angel",
  kind: "conditional",
  label: "재의 천사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#c084fc"
   ]
  }
 },
 {
  code: "ringing_pilgrim",
  kind: "conditional",
  label: "길 비우는 소리",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "temple_procession",
  kind: "conditional",
  label: "행렬의 선두",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "never_sheathed",
  kind: "conditional",
  label: "칼집 없는 자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "ember_ball",
  kind: "conditional",
  label: "잿불 무도",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "forge_hand",
  kind: "conditional",
  label: "불을 다루는 손",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "antler_hunter",
  kind: "conditional",
  label: "뿔의 사냥꾼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "marsh_tracker",
  kind: "conditional",
  label: "늪을 읽는 자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "summer_keeper",
  kind: "conditional",
  label: "여름을 든 자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "green_circle",
  kind: "conditional",
  label: "푸른 원",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "oni_slayer",
  kind: "conditional",
  label: "귀참",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "red_edge",
  kind: "conditional",
  label: "붉은 날",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "mask_and_blade",
  kind: "conditional",
  label: "가면과 칼",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "thorn_bearer",
  kind: "conditional",
  label: "가시를 쥔 자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "first_bitter",
  kind: "permanent",
  label: "첫 쓴맛",
  hidden: true,
  cat: "강화",
  style: {
   color: "#d2b193"
  }
 },
 {
  code: "late_bloomer",
  kind: "permanent",
  label: "늦게 핀 꽃",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "combo_001",
  kind: "conditional",
  label: "뇌신 강림",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_002",
  kind: "conditional",
  label: "별에 묻는 길",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_003",
  kind: "conditional",
  label: "한겨울 산책",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "combo_004",
  kind: "conditional",
  label: "용암 한 벌",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_005",
  kind: "conditional",
  label: "그림자 손님",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_006",
  kind: "conditional",
  label: "숲의 식구",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_007",
  kind: "conditional",
  label: "옥좌의 창",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_008",
  kind: "conditional",
  label: "온전한 비행",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_009",
  kind: "conditional",
  label: "조상님 총출동",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_010",
  kind: "conditional",
  label: "장마 준비 끝",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_011",
  kind: "conditional",
  label: "한밤의 무도회",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_012",
  kind: "conditional",
  label: "재의 시간",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_013",
  kind: "conditional",
  label: "종신 교수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_014",
  kind: "conditional",
  label: "심쿵 저격수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_015",
  kind: "conditional",
  label: "침묵의 한 발",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff6c06",
   glow: true
  }
 },
 {
  code: "combo_016",
  kind: "conditional",
  label: "미라클 모닝",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_017",
  kind: "conditional",
  label: "숲 속 괴담",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#22c55e",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_018",
  kind: "conditional",
  label: "몰락한 왕좌",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_019",
  kind: "conditional",
  label: "불꽃 댄서",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_020",
  kind: "conditional",
  label: "청홍의 균형",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_021",
  kind: "conditional",
  label: "매의 눈",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_022",
  kind: "conditional",
  label: "우중 순례",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_023",
  kind: "conditional",
  label: "용의 행상인",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_024",
  kind: "conditional",
  label: "가시 속 장미",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_025",
  kind: "conditional",
  label: "하루의 끝",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_026",
  kind: "conditional",
  label: "식지 않는 불",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_027",
  kind: "conditional",
  label: "쪽빛 일색",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#60a5fa",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_028",
  kind: "conditional",
  label: "구름 위 산책",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_029",
  kind: "conditional",
  label: "쏟아지는 밤",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_030",
  kind: "conditional",
  label: "까마귀 마녀",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_031",
  kind: "conditional",
  label: "진홍 일색",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_032",
  kind: "conditional",
  label: "늪의 그림자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#00dd51",
   glow: true
  }
 },
 {
  code: "combo_033",
  kind: "conditional",
  label: "금빛 일색",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_034",
  kind: "conditional",
  label: "칠흑 일색",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_035",
  kind: "conditional",
  label: "개구리 사냥",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#22c55e",
    "#f97316"
   ]
  }
 },
 {
  code: "combo_036",
  kind: "conditional",
  label: "재의 궁수",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_037",
  kind: "conditional",
  label: "맹세의 아침",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_038",
  kind: "conditional",
  label: "서약의 기사",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_039",
  kind: "conditional",
  label: "설원의 저격수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#519fff",
   glow: true
  }
 },
 {
  code: "combo_040",
  kind: "conditional",
  label: "연못의 주인",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_041",
  kind: "conditional",
  label: "숲의 현자",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_042",
  kind: "conditional",
  label: "수상한 사제",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_043",
  kind: "conditional",
  label: "사막의 낭인",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "combo_044",
  kind: "conditional",
  label: "충성의 무게",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_045",
  kind: "conditional",
  label: "저녁놀",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_046",
  kind: "conditional",
  label: "첫 왈츠",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_047",
  kind: "conditional",
  label: "불꽃 놀이",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_048",
  kind: "conditional",
  label: "하늘 수비대",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ],
   glow: true
  }
 },
 {
  code: "combo_049",
  kind: "conditional",
  label: "견습 마왕",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_050",
  kind: "conditional",
  label: "빛의 기사",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ],
   glow: true
  }
 },
 {
  code: "combo_051",
  kind: "conditional",
  label: "천문학 개론",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_052",
  kind: "conditional",
  label: "길잡이 매",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_053",
  kind: "conditional",
  label: "선봉의 깃발",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_054",
  kind: "conditional",
  label: "첫눈 마중",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "combo_055",
  kind: "conditional",
  label: "빛나는 아침",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_056",
  kind: "conditional",
  label: "늪의 문지기",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_057",
  kind: "conditional",
  label: "용의 대장간",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_058",
  kind: "conditional",
  label: "우레 기병",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "combo_059",
  kind: "conditional",
  label: "모래폭풍 사수",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_060",
  kind: "conditional",
  label: "떠돌이 상인",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "combo_061",
  kind: "conditional",
  label: "늪의 주술사",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#22c55e",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_062",
  kind: "conditional",
  label: "왕국의 새벽",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_063",
  kind: "conditional",
  label: "푸른 맹세",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#60a5fa",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_064",
  kind: "conditional",
  label: "잿바람",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_065",
  kind: "conditional",
  label: "새벽 사냥꾼",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_066",
  kind: "conditional",
  label: "재건의 망치",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_067",
  kind: "conditional",
  label: "가면의 검무",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_068",
  kind: "conditional",
  label: "수석 사수",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_069",
  kind: "conditional",
  label: "성전의 창",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_070",
  kind: "conditional",
  label: "백작의 오후",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_071",
  kind: "conditional",
  label: "스러진 시간",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#f97316",
    "#c084fc"
   ],
   glow: true
  }
 },
 {
  code: "combo_072",
  kind: "conditional",
  label: "세 번의 맹세",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ffbe16",
   glow: true
  }
 },
 {
  code: "combo_073",
  kind: "conditional",
  label: "새들의 회의",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "combo_074",
  kind: "conditional",
  label: "꽃길만 걷자",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_075",
  kind: "conditional",
  label: "새벽 별지기",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_076",
  kind: "conditional",
  label: "셀프 대관식",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_077",
  kind: "conditional",
  label: "촌캉스",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_078",
  kind: "conditional",
  label: "작은 악당",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_079",
  kind: "conditional",
  label: "온몸이 불꽃",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ff2a2a",
   glow: true
  }
 },
 {
  code: "combo_080",
  kind: "conditional",
  label: "붉은 근위대",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_081",
  kind: "conditional",
  label: "초원의 부름",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "combo_082",
  kind: "conditional",
  label: "군악대장",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#f97316",
    "#fbbf24"
   ]
  }
 },
 {
  code: "combo_083",
  kind: "conditional",
  label: "심안",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#f97316",
    "#c084fc"
   ],
   glow: true
  }
 },
 {
  code: "combo_084",
  kind: "conditional",
  label: "조상님 어깨너머",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#f97316"
   ]
  }
 },
 {
  code: "combo_085",
  kind: "conditional",
  label: "새참의 맛",
  hidden: true,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#ef4444",
    "#22c55e",
    "#f97316"
   ]
  }
 },
 {
  code: "combo_086",
  kind: "conditional",
  label: "빛 수집가",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_087",
  kind: "conditional",
  label: "쌍검비무",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "combo_088",
  kind: "conditional",
  label: "이름 없는 총성",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "combo_089",
  kind: "conditional",
  label: "뇌룡 기수",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#98aaff",
   glow: true
  }
 },
 {
  code: "combo_090",
  kind: "conditional",
  label: "동트기 전",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_091",
  kind: "conditional",
  label: "은빛 아침",
  hidden: false,
  cat: "아이템 발동",
  style: {
   gradient: [
    "#fbbf24",
    "#c084fc"
   ]
  }
 },
 {
  code: "enhance_5000",
  kind: "permanent",
  label: "쇠를 아는 손",
  hidden: true,
  cat: "강화",
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "enhance_50000",
  kind: "permanent",
  label: "망치와 한 몸",
  hidden: false,
  cat: "강화",
  style: {
   fx: "flame"
  }
 },
 {
  code: "hold_50",
  kind: "permanent",
  label: "뿌리 깊은 손",
  hidden: true,
  cat: "강화",
  style: {
   fx: "forgeshine"
  }
 },
 {
  code: "mega_streak_7",
  kind: "permanent",
  label: "칠성의 가호",
  hidden: true,
  cat: "강화",
  style: {
   fx: "cinderflow"
  }
 },
 {
  code: "supply_30000",
  kind: "permanent",
  label: "창고지기",
  hidden: false,
  cat: "보급",
  style: {
   fx: "honeydrip"
  }
 },
 {
  code: "raid_1000",
  kind: "permanent",
  label: "천 번의 종소리",
  hidden: false,
  cat: "레이드",
  style: {
   fx: "warbanner"
  }
 },
 {
  code: "raid_strike_20m",
  kind: "permanent",
  label: "꿰뚫는 일격",
  hidden: true,
  cat: "레이드",
  style: {
   fx: "warbanner"
  }
 },
 {
  code: "melee_podium_50",
  kind: "permanent",
  label: "메달 수집가",
  hidden: true,
  cat: "대난투",
  style: {
   fx: "duelflow"
  }
 },
 {
  code: "cq_defend_300",
  kind: "permanent",
  label: "천년 파수꾼",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "verdigris"
  }
 },
 {
  code: "cq_tax_100",
  kind: "permanent",
  label: "곳간의 열쇠",
  hidden: true,
  cat: "점령전",
  style: {
   fx: "bronzeshine"
  }
 },
 {
  code: "chat_10000",
  kind: "permanent",
  label: "대장간의 목소리",
  hidden: false,
  cat: "소셜",
  style: {
   fx: "azureflow"
  }
 },
 {
  code: "checkin_100",
  kind: "permanent",
  label: "백일의 등불",
  hidden: true,
  cat: "일상",
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "combo_icehearth",
  kind: "conditional",
  label: "얼음 화로",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "combo_gradball",
  kind: "conditional",
  label: "졸업 무도회",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "combo_marshfire",
  kind: "conditional",
  label: "습지의 불꽃",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "combo_galaxyknight",
  kind: "conditional",
  label: "은하 기사",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_plaindrum",
  kind: "conditional",
  label: "초원의 북소리",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#f97316"
  }
 },
 {
  code: "combo_fallenwing",
  kind: "conditional",
  label: "몰락한 날개",
  hidden: false,
  cat: "아이템 발동",
  style: {
   color: "#bb77ff",
   glow: true
  }
 },
 {
  code: "combo_sunsetpilgrim",
  kind: "conditional",
  label: "노을 순례",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "combo_royalduel",
  kind: "conditional",
  label: "왕실 검객",
  hidden: true,
  cat: "아이템 발동",
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "exp_first",
  kind: "permanent",
  label: "첫 원정",
  hidden: false,
  cat: "파견",
  style: {
   color: "#b3cbaa"
  }
 },
 {
  code: "exp_50",
  kind: "permanent",
  label: "원정대장",
  hidden: false,
  cat: "파견",
  style: {
   color: "#9ccc8a"
  }
 },
 {
  code: "exp_500",
  kind: "permanent",
  label: "전설의 원정대",
  hidden: false,
  cat: "파견",
  style: {
   fx: "trailflow"
  }
 },
 {
  code: "exp_all_regions",
  kind: "permanent",
  label: "여섯 갈래 길",
  hidden: false,
  cat: "파견",
  style: {
   color: "#9ccc8a"
  }
 },
 {
  code: "exp_200",
  kind: "permanent",
  label: "긴 여정의 끝",
  hidden: false,
  cat: "파견",
  style: {
   fx: "trailflow"
  }
 },
 {
  code: "exp_crit_10",
  kind: "permanent",
  label: "행운의 귀환",
  hidden: false,
  cat: "파견",
  style: {
   color: "#9ccc8a"
  }
 },
 {
  code: "exp_crit_30",
  kind: "permanent",
  label: "노련한 지휘관",
  hidden: false,
  cat: "파견",
  style: {
   fx: "trailflow"
  }
 },
 {
  code: "exp_four_slots",
  kind: "permanent",
  label: "원정 사령관",
  hidden: false,
  cat: "파견",
  style: {
   fx: "trailflow"
  }
 },
 {
  code: "guild_officer",
  kind: "conditional",
  label: "오른팔",
  hidden: false,
  cat: "길드",
  style: {
   color: "#cec6e0"
  }
 },
 {
  code: "guild_top_contrib",
  kind: "conditional",
  label: "살림꾼",
  hidden: false,
  cat: "길드",
  style: {
   color: "#cec6e0"
  }
 },
 {
  code: "guild_old_100",
  kind: "conditional",
  label: "유서 깊은 가문",
  hidden: false,
  cat: "길드",
  style: {
   fx: "silk"
  }
 },
 {
  code: "guild_top_combat",
  kind: "conditional",
  label: "불패의 신화",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "legendstatic",
   glow: true
  }
 },
 {
  code: "guild_top_zones",
  kind: "conditional",
  label: "대륙의 주인",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "verdantstatic",
   glow: true
  }
 },
 {
  code: "guild_top_tax",
  kind: "conditional",
  label: "황금 곳간",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "treasury",
   glow: true
  }
 },
 {
  code: "guild_zones_25",
  kind: "conditional",
  label: "지지 않는 태양",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "solarcrown",
   glow: true
  }
 },
 {
  code: "guild_no_loss_7d",
  kind: "conditional",
  label: "난공불락",
  hidden: false,
  cat: "점령전",
  style: {
   fx: "steelshine",
   glow: true
  }
 },
 {
  code: "region_owner_volcano",
  kind: "conditional",
  label: "드래곤 화산 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "드래곤 화산",
    color: "#ef4444"
   }
  }
 },
 {
  code: "region_owner_temple",
  kind: "conditional",
  label: "잊힌 신전 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "잊힌 신전",
    color: "#60a5fa"
   }
  }
 },
 {
  code: "region_owner_swamp",
  kind: "conditional",
  label: "슬라임 늪 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "슬라임 늪",
    color: "#22c55e"
   }
  }
 },
 {
  code: "region_owner_orc",
  kind: "conditional",
  label: "오크 부락 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "오크 부락",
    color: "#f97316"
   }
  }
 },
 {
  code: "region_owner_kingdom",
  kind: "conditional",
  label: "왕국 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "왕국",
    color: "#fbbf24"
   }
  }
 },
 {
  code: "region_owner_angel",
  kind: "conditional",
  label: "타락 천사 부유섬 주인",
  hidden: false,
  cat: "점령전",
  style: {
   color: "#dcdfe6",
   prefix: {
    text: "타락 천사 부유섬",
    color: "#c084fc"
   }
  }
 }
] as const;

export const TITLE_BY_CODE: ReadonlyMap<string, TitleDef> = new Map(TITLE_DEFS.map((t) => [t.code, t]));
