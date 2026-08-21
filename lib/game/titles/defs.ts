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
  /** 어려움·한정 공통 은은한 발광. */
  glow?: boolean;
  /** 집행관 — ExecutorTag 렌더 위임. */
  executor?: boolean;
};

export type TitleDef = { code: string; kind: TitleKind; label: string; hidden: boolean; style: TitleStyle };

export const TITLE_DEFS: TitleDef[] = [
 {
  code: "rank_combat",
  kind: "conditional",
  label: "가장 높은 망치",
  hidden: false,
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
  style: {
   executor: true
  }
 },
 {
  code: "melee_champion",
  kind: "conditional",
  label: "왕좌의 온기",
  hidden: false,
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
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "raid_hero",
  kind: "conditional",
  label: "간밤의 영웅",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "rich_apex",
  kind: "conditional",
  label: "황금 왕좌",
  hidden: true,
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
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "broke_now",
  kind: "conditional",
  label: "빈털터리",
  hidden: true,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "star_holder",
  kind: "conditional",
  label: "별의 주인",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "full_armed",
  kind: "conditional",
  label: "완전 무장",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "lib_first",
  kind: "permanent",
  label: "사슬을 끊은 자",
  hidden: false,
  style: {
   color: "#c9a2f0"
  }
 },
 {
  code: "lib_holder",
  kind: "conditional",
  label: "해방자",
  hidden: false,
  style: {
   color: "#c9a2f0"
  }
 },
 {
  code: "lib_ten",
  kind: "conditional",
  label: "지배자",
  hidden: false,
  style: {
   color: "#c9a2f0",
   glow: true
  }
 },
 {
  code: "champ_5",
  kind: "conditional",
  label: "정복자",
  hidden: false,
  style: {
   color: "#c9a2f0",
   glow: true
  }
 },
 {
  code: "enhance_100",
  kind: "permanent",
  label: "백 번째 불꽃",
  hidden: false,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "enhance_200",
  kind: "permanent",
  label: "별에 닿은 망치",
  hidden: false,
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
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_streak",
  kind: "permanent",
  label: "그런 날이 있다",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_10",
  kind: "permanent",
  label: "바닥 밑에 바닥",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "hold_streak",
  kind: "permanent",
  label: "요지부동",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "hold_20",
  kind: "permanent",
  label: "만년설",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "phoenix",
  kind: "permanent",
  label: "오뚝이",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "double_joy",
  kind: "permanent",
  label: "겹경사",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "lucky_hammer",
  kind: "permanent",
  label: "행운의 망치",
  hidden: false,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "down_curse",
  kind: "permanent",
  label: "저주받은 손",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "enhance_10000",
  kind: "permanent",
  label: "무쇠팔",
  hidden: false,
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
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "five_min",
  kind: "permanent",
  label: "화로 곁의 파수꾼",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "aging",
  kind: "permanent",
  label: "잊혀진 불씨",
  hidden: true,
  style: {
   fx: "breath"
  }
 },
 {
  code: "balance_master",
  kind: "conditional",
  label: "삼위일체",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "owl",
  kind: "permanent",
  label: "올빼미",
  hidden: true,
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "early_bird",
  kind: "permanent",
  label: "아침형 인간",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "weekend",
  kind: "permanent",
  label: "주말 출근",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "monday",
  kind: "permanent",
  label: "월요병",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "friday",
  kind: "permanent",
  label: "불타는 금요일",
  hidden: true,
  style: {
   color: "#8fb4d8",
   glow: true
  }
 },
 {
  code: "supply_binge",
  kind: "permanent",
  label: "수확의 날",
  hidden: false,
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "supply_5000",
  kind: "permanent",
  label: "보급왕",
  hidden: false,
  style: {
   color: "#b8a97a",
   glow: true
  }
 },
 {
  code: "supply_10000",
  kind: "permanent",
  label: "만물상",
  hidden: false,
  style: {
   color: "#b8a97a",
   glow: true
  }
 },
 {
  code: "same_pull",
  kind: "permanent",
  label: "데자뷔",
  hidden: true,
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "transcend_300",
  kind: "permanent",
  label: "경계 너머",
  hidden: false,
  style: {
   color: "#b39ddb"
  }
 },
 {
  code: "transcend_1000",
  kind: "permanent",
  label: "초월자",
  hidden: false,
  style: {
   color: "#b39ddb",
   glow: true
  }
 },
 {
  code: "transcend_deep",
  kind: "permanent",
  label: "별을 넘는 자",
  hidden: false,
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
  style: {
   color: "#b39ddb",
   glow: true
  }
 },
 {
  code: "codex_120",
  kind: "permanent",
  label: "마지막 페이지",
  hidden: false,
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
  style: {
   color: "#d88c8c",
   glow: true
  }
 },
 {
  code: "raid_365",
  kind: "permanent",
  label: "끝없는 원정",
  hidden: false,
  style: {
   color: "#d88c8c",
   glow: true
  }
 },
 {
  code: "raid_volcano",
  kind: "permanent",
  label: "불을 삼킨 자",
  hidden: false,
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
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "melee_30_win",
  kind: "permanent",
  label: "패왕",
  hidden: false,
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
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "melee_podium",
  kind: "permanent",
  label: "정상권",
  hidden: false,
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "melee_30",
  kind: "permanent",
  label: "역전의 용사",
  hidden: false,
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "melee_comet",
  kind: "permanent",
  label: "혜성",
  hidden: true,
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "melee_last",
  kind: "permanent",
  label: "꼴찌의 품격",
  hidden: true,
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "kong_line",
  kind: "permanent",
  label: "2인자",
  hidden: true,
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "tax_collector",
  kind: "permanent",
  label: "징수관",
  hidden: false,
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "siege_30",
  kind: "permanent",
  label: "공성의 선봉",
  hidden: false,
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "wall",
  kind: "permanent",
  label: "성벽",
  hidden: false,
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "tour_lord",
  kind: "permanent",
  label: "순회 영주",
  hidden: true,
  style: {
   color: "#c2b280",
   glow: true
  }
 },
 {
  code: "guild_founder",
  kind: "permanent",
  label: "첫 깃발",
  hidden: false,
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "guild_donate",
  kind: "permanent",
  label: "아낌없는 손",
  hidden: false,
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "no_guild_30",
  kind: "conditional",
  label: "무소속",
  hidden: true,
  style: {
   fx: "breath"
  }
 },
 {
  code: "friends_30",
  kind: "permanent",
  label: "마당발",
  hidden: false,
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "invite_1",
  kind: "permanent",
  label: "두 번째 발자국",
  hidden: false,
  style: {
   fx: "pearl"
  }
 },
 {
  code: "invite_5",
  kind: "permanent",
  label: "길잡이",
  hidden: false,
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "invite_20",
  kind: "permanent",
  label: "모병관",
  hidden: false,
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
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "mention_100",
  kind: "permanent",
  label: "모두가 찾는 이름",
  hidden: true,
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "checkin_30",
  kind: "permanent",
  label: "개근상",
  hidden: false,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "checkin_365",
  kind: "permanent",
  label: "사계절의 망치",
  hidden: true,
  style: {
   color: "#a8a8b0",
   glow: true
  }
 },
 {
  code: "mail_1000",
  kind: "permanent",
  label: "우편함 지기",
  hidden: false,
  style: {
   color: "#a8a8b0",
   glow: true
  }
 },
 {
  code: "resident_10",
  kind: "permanent",
  label: "지박령",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "mover_30",
  kind: "permanent",
  label: "역마살",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "time_gold",
  kind: "permanent",
  label: "시간은 금",
  hidden: true,
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "lucky_777",
  kind: "permanent",
  label: "럭키 세븐",
  hidden: true,
  style: {
   fx: "goldsoft"
  }
 },
 {
  code: "power_77777",
  kind: "permanent",
  label: "칠칠칠칠칠",
  hidden: true,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "dragon_hoard",
  kind: "permanent",
  label: "자린고비",
  hidden: true,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "pay_first",
  kind: "permanent",
  label: "첫 후원",
  hidden: false,
  style: {
   fx: "goldleaf"
  }
 },
 {
  code: "pay_5",
  kind: "permanent",
  label: "기사 후원자",
  hidden: false,
  style: {
   fx: "goldsoft"
  }
 },
 {
  code: "pay_20",
  kind: "permanent",
  label: "영주 후원자",
  hidden: false,
  style: {
   fx: "goldglow"
  }
 },
 {
  code: "pay_50",
  kind: "permanent",
  label: "왕실 후원자",
  hidden: false,
  style: {
   fx: "goldflow",
   glow: true
  }
 },
 {
  code: "pay_200",
  kind: "permanent",
  label: "왕국의 기둥",
  hidden: false,
  style: {
   fx: "goldflow",
   pt: "stardust",
   glow: true
  }
 },
 {
  code: "two_mirrors",
  kind: "permanent",
  label: "두 개의 거울",
  hidden: true,
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "same_face_30",
  kind: "permanent",
  label: "한결같은 얼굴",
  hidden: true,
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "same_combo",
  kind: "permanent",
  label: "필연",
  hidden: true,
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "avatar_50",
  kind: "permanent",
  label: "왕실 의상실",
  hidden: false,
  style: {
   color: "#d8a0c8",
   glow: true
  }
 },
 {
  code: "avatar_1000",
  kind: "permanent",
  label: "천의 얼굴",
  hidden: true,
  style: {
   fx: "pearl",
   glow: true
  }
 },
 {
  code: "full_course",
  kind: "permanent",
  label: "대륙 일주",
  hidden: true,
  style: {
   color: "#80cbc4"
  }
 },
 {
  code: "pentagon",
  kind: "permanent",
  label: "오관왕",
  hidden: true,
  style: {
   fx: "pentaflow",
   glow: true
  }
 },
 {
  code: "apex_shoot",
  kind: "permanent",
  label: "전성기",
  hidden: true,
  style: {
   color: "#80cbc4",
   glow: true
  }
 },
 {
  code: "kintsugi_master",
  kind: "conditional",
  label: "흑금의 주인",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "starfield_master",
  kind: "conditional",
  label: "별자리를 쥔 손",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "true_witch",
  kind: "conditional",
  label: "진짜 마녀",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "winter_itself",
  kind: "conditional",
  label: "겨울의 화신",
  hidden: true,
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "dawn_knight",
  kind: "conditional",
  label: "여명의 기사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "dragon_heir",
  kind: "conditional",
  label: "용의 후예",
  hidden: true,
  style: {
   color: "#ef4444",
   glow: true
  }
 },
 {
  code: "crown_touch",
  kind: "permanent",
  label: "화룡점정",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "lightning",
  kind: "permanent",
  label: "번갯불",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "pure_way",
  kind: "permanent",
  label: "정공법",
  hidden: false,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "enhance_1000",
  kind: "permanent",
  label: "천리길",
  hidden: false,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "beginner_mind",
  kind: "permanent",
  label: "초심",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "blitz",
  kind: "permanent",
  label: "속전속결",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "fire_play",
  kind: "permanent",
  label: "불장난",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "curse_of_9",
  kind: "permanent",
  label: "9의 저주",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "eclipse",
  kind: "permanent",
  label: "별의 끝",
  hidden: false,
  style: {
   color: "#b39ddb",
   glow: true
  }
 },
 {
  code: "galaxy",
  kind: "permanent",
  label: "은하수",
  hidden: false,
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
  style: {
   color: "#d88c8c"
  }
 },
 {
  code: "continent_sweep",
  kind: "permanent",
  label: "대륙 토벌",
  hidden: false,
  style: {
   color: "#d88c8c",
   glow: true
  }
 },
 {
  code: "iron_man",
  kind: "permanent",
  label: "철인",
  hidden: false,
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
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "ram",
  kind: "permanent",
  label: "공성추",
  hidden: false,
  style: {
   color: "#c2b280"
  }
 },
 {
  code: "iron_wall",
  kind: "permanent",
  label: "철옹성",
  hidden: false,
  style: {
   color: "#c2b280",
   glow: true
  }
 },
 {
  code: "witness",
  kind: "permanent",
  label: "터줏대감",
  hidden: false,
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "homecoming",
  kind: "permanent",
  label: "귀향",
  hidden: true,
  style: {
   color: "#e0b877"
  }
 },
 {
  code: "pillar",
  kind: "permanent",
  label: "대들보",
  hidden: false,
  style: {
   color: "#e0b877",
   glow: true
  }
 },
 {
  code: "surpassed",
  kind: "permanent",
  label: "청출어람",
  hidden: true,
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
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "comeback",
  kind: "permanent",
  label: "휴가 복귀",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "time_capsule",
  kind: "permanent",
  label: "연륜",
  hidden: false,
  style: {
   color: "#a8a8b0",
   glow: true
  }
 },
 {
  code: "bottomless",
  kind: "permanent",
  label: "큰손",
  hidden: true,
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "billionaire",
  kind: "permanent",
  label: "백만장자",
  hidden: false,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "rebirth",
  kind: "permanent",
  label: "환골탈태",
  hidden: true,
  style: {
   color: "#d8a0c8",
   glow: true
  }
 },
 {
  code: "one_suit",
  kind: "permanent",
  label: "단벌 신사",
  hidden: true,
  style: {
   color: "#d8a0c8",
   glow: true
  }
 },
 {
  code: "disguise",
  kind: "permanent",
  label: "변장술사",
  hidden: false,
  style: {
   color: "#d8a0c8",
   glow: true
  }
 },
 {
  code: "model_student",
  kind: "conditional",
  label: "모범생",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "night_noble",
  kind: "conditional",
  label: "밤의 귀족",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "valkyrie",
  kind: "conditional",
  label: "발키리",
  hidden: true,
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
  style: {
   fx: "aurora"
  }
 },
 {
  code: "outlaw",
  kind: "conditional",
  label: "무법자",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "armory_lord",
  kind: "conditional",
  label: "병기고의 주인",
  hidden: false,
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
  style: {
   color: "#80cbc4",
   glow: true
  }
 },
 {
  code: "enhance_150",
  kind: "permanent",
  label: "성층권",
  hidden: false,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "morning_ration",
  kind: "permanent",
  label: "아침 배급",
  hidden: true,
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "three_meals",
  kind: "permanent",
  label: "삼시세끼",
  hidden: true,
  style: {
   color: "#b8a97a",
   glow: true
  }
 },
 {
  code: "assault_100",
  kind: "permanent",
  label: "돌격대장",
  hidden: false,
  style: {
   color: "#c2b280",
   glow: true
  }
 },
 {
  code: "guardian_100",
  kind: "permanent",
  label: "수호신",
  hidden: false,
  style: {
   color: "#c2b280",
   glow: true
  }
 },
 {
  code: "raid_100days",
  kind: "permanent",
  label: "백일 원정",
  hidden: true,
  style: {
   color: "#d88c8c",
   glow: true
  }
 },
 {
  code: "winter_blade",
  kind: "conditional",
  label: "겨울 검객",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "star_mage",
  kind: "conditional",
  label: "별의 마술사",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "thunder_emperor",
  kind: "conditional",
  label: "뇌제",
  hidden: true,
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
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "blue_sky",
  kind: "conditional",
  label: "창천",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "phoenix_archer",
  kind: "conditional",
  label: "불사조",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "shaman",
  kind: "conditional",
  label: "주술사",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "angler",
  kind: "conditional",
  label: "강태공",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "paladin",
  kind: "conditional",
  label: "성기사",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "astrologer",
  kind: "conditional",
  label: "점성술사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "masquerade",
  kind: "conditional",
  label: "가면무도회",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "headmaster",
  kind: "conditional",
  label: "학장",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "coronation",
  kind: "conditional",
  label: "대관식",
  hidden: true,
  style: {
   color: "#fbbf24",
   glow: true
  }
 },
 {
  code: "perpetual",
  kind: "permanent",
  label: "꺼지지 않는 불",
  hidden: false,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "new_record",
  kind: "permanent",
  label: "신기록",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "cliff_edge",
  kind: "permanent",
  label: "절벽 끝에서",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "flawless_100",
  kind: "permanent",
  label: "백발백중",
  hidden: true,
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "midnight_snack",
  kind: "permanent",
  label: "야식",
  hidden: true,
  style: {
   color: "#b8a97a"
  }
 },
 {
  code: "meteor_shower",
  kind: "permanent",
  label: "유성우",
  hidden: true,
  style: {
   color: "#b39ddb"
  }
 },
 {
  code: "month_war",
  kind: "permanent",
  label: "불굴",
  hidden: true,
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "fire_support",
  kind: "permanent",
  label: "지원 사격",
  hidden: true,
  style: {
   color: "#d88c8c"
  }
 },
 {
  code: "initiation",
  kind: "permanent",
  label: "신고식",
  hidden: false,
  style: {
   color: "#d8a0c8"
  }
 },
 {
  code: "dust_to_mountain",
  kind: "permanent",
  label: "티끌 모아 태산",
  hidden: false,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "old_friend",
  kind: "permanent",
  label: "죽마고우",
  hidden: true,
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "streak_king",
  kind: "conditional",
  label: "개근왕",
  hidden: false,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "frog_sniper",
  kind: "conditional",
  label: "개구리 저격수",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "gentleman",
  kind: "conditional",
  label: "신사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "cupid",
  kind: "conditional",
  label: "큐피드",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "hunter",
  kind: "conditional",
  label: "사냥꾼",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "twin_saber",
  kind: "conditional",
  label: "쌍검객",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "standard_bearer",
  kind: "conditional",
  label: "기수",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "ash_reaper",
  kind: "conditional",
  label: "재의 수확자",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "dusk",
  kind: "conditional",
  label: "황혼",
  hidden: true,
  style: {
   fx: "duskfade"
  }
 },
 {
  code: "sky_knight",
  kind: "conditional",
  label: "창공의 기사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "dragon_slayer",
  kind: "conditional",
  label: "용살자",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "shadow",
  kind: "conditional",
  label: "그림자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "forge_heart",
  kind: "conditional",
  label: "화심",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "grim_reaper",
  kind: "conditional",
  label: "사신",
  hidden: true,
  style: {
   color: "#c084fc",
   glow: true
  }
 },
 {
  code: "necromancer",
  kind: "conditional",
  label: "강령술사",
  hidden: true,
  style: {
   color: "#c084fc",
   glow: true
  }
 },
 {
  code: "morning_blade",
  kind: "conditional",
  label: "아침의 검",
  hidden: true,
  style: {
   color: "#c084fc",
   glow: true
  }
 },
 {
  code: "twin_wings",
  kind: "conditional",
  label: "쌍익",
  hidden: true,
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
  style: {
   color: "#f97316"
  }
 },
 {
  code: "little_angel",
  kind: "conditional",
  label: "꼬마 천사",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "lily_spirit",
  kind: "conditional",
  label: "수련의 정령",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "fire_dancer",
  kind: "conditional",
  label: "불의 무희",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "beast_king",
  kind: "conditional",
  label: "야수의 왕",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "royal_guard",
  kind: "conditional",
  label: "근위대장",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "rising_star",
  kind: "conditional",
  label: "신흥 강자",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "big_family",
  kind: "conditional",
  label: "대가족",
  hidden: false,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "top_patron",
  kind: "conditional",
  label: "재상",
  hidden: true,
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
  style: {
   color: "#cdb04e"
  }
 },
 {
  code: "army_100k",
  kind: "permanent",
  label: "만부부당",
  hidden: false,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "seven_falls",
  kind: "permanent",
  label: "칠전팔기",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "reincarnation",
  kind: "permanent",
  label: "환생",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "insomnia",
  kind: "permanent",
  label: "불면증",
  hidden: true,
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
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "weekend_raid",
  kind: "permanent",
  label: "주말 원정대",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "king_return",
  kind: "permanent",
  label: "왕의 귀환",
  hidden: true,
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "big_eater",
  kind: "permanent",
  label: "우편 홍수",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "triathlon",
  kind: "permanent",
  label: "철인 3종",
  hidden: true,
  style: {
   color: "#80cbc4"
  }
 },
 {
  code: "seraph",
  kind: "conditional",
  label: "세라핌",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "black_knight",
  kind: "conditional",
  label: "흑기사",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "field_marshal",
  kind: "conditional",
  label: "대원수",
  hidden: true,
  style: {
   color: "#fbbf24",
   glow: true
  }
 },
 {
  code: "snow_priest",
  kind: "conditional",
  label: "설야의 사제",
  hidden: true,
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "firebird",
  kind: "conditional",
  label: "불새",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "forest_keeper",
  kind: "conditional",
  label: "숲지기",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "star_reader",
  kind: "conditional",
  label: "별을 읽는 자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "penitent",
  kind: "conditional",
  label: "속죄자",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "bog_warden",
  kind: "conditional",
  label: "늪의 파수꾼",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "ascetic",
  kind: "conditional",
  label: "수행자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lion_knight",
  kind: "conditional",
  label: "사자 기사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "herald",
  kind: "conditional",
  label: "전령",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "bog_witch",
  kind: "conditional",
  label: "늪마녀",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "self_saint",
  kind: "conditional",
  label: "자칭 성자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lava_dancer",
  kind: "conditional",
  label: "화염 무도",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "vampire",
  kind: "conditional",
  label: "흡혈귀",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "lantern_keeper",
  kind: "conditional",
  label: "등불지기",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "herbalist",
  kind: "conditional",
  label: "약초꾼",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "little_devil",
  kind: "conditional",
  label: "꼬마 악마",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "drunkard",
  kind: "conditional",
  label: "술고래",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "feather_style",
  kind: "conditional",
  label: "깃털 단장",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "one_eye",
  kind: "conditional",
  label: "외눈 검객",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "trumpeter",
  kind: "conditional",
  label: "나팔수",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "drummer",
  kind: "conditional",
  label: "북재비",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "court_dancer",
  kind: "conditional",
  label: "궁중 무희",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "tribal_banner",
  kind: "conditional",
  label: "부족의 기수",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "mechanic",
  kind: "conditional",
  label: "정비공",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "ice_heart",
  kind: "conditional",
  label: "얼음 심장",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "iron_fist",
  kind: "conditional",
  label: "강철 주먹",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "lion_heart",
  kind: "conditional",
  label: "사자의 심장",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "fur_collar",
  kind: "conditional",
  label: "설백",
  hidden: true,
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "incense_keeper",
  kind: "conditional",
  label: "향지기",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "dragon_face",
  kind: "conditional",
  label: "용의 얼굴",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "snow_monk",
  kind: "conditional",
  label: "설산 수도승",
  hidden: true,
  style: {
   color: "#60a5fa"
  }
 },
 {
  code: "fallen_priest",
  kind: "conditional",
  label: "타락 사제",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "volcano_smith",
  kind: "conditional",
  label: "화산 대장장이",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "thunder_general",
  kind: "conditional",
  label: "뇌운의 장군",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "honor_student",
  kind: "conditional",
  label: "우등생",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "fluffy_cloud",
  kind: "conditional",
  label: "뭉게구름",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "frog_person",
  kind: "conditional",
  label: "개구리 인간",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "peddler",
  kind: "conditional",
  label: "보부상",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "flower_crown",
  kind: "conditional",
  label: "화관",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "pointy_hat",
  kind: "conditional",
  label: "뾰족 모자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "bookworm",
  kind: "conditional",
  label: "책벌레",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "firefly",
  kind: "conditional",
  label: "반딧불",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "azure_knight",
  kind: "conditional",
  label: "쪽빛 기사",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "pumpkin_glow",
  kind: "conditional",
  label: "호박등",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "old_professor",
  kind: "conditional",
  label: "노교수",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "silence",
  kind: "conditional",
  label: "침묵",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "lily_pad",
  kind: "conditional",
  label: "수련잎",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "ball_night",
  kind: "conditional",
  label: "무도회의 밤",
  hidden: true,
  style: {
   fx: "silk"
  }
 },
 {
  code: "white_feather",
  kind: "conditional",
  label: "하얀 깃",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "hourglass",
  kind: "conditional",
  label: "모래시계",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "ancestor",
  kind: "conditional",
  label: "조상님",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "star_gazer",
  kind: "conditional",
  label: "별점",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "nomad_fox",
  kind: "conditional",
  label: "사막 여우",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "red_night",
  kind: "conditional",
  label: "붉은 밤",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "raven",
  kind: "conditional",
  label: "갈까마귀",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "starlight_cloak",
  kind: "conditional",
  label: "별빛 망토",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "snow_flower",
  kind: "conditional",
  label: "설화",
  hidden: true,
  style: {
   fx: "frostedge"
  }
 },
 {
  code: "fire_dragon",
  kind: "conditional",
  label: "화룡",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "obsidian",
  kind: "conditional",
  label: "흑요",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "radiance",
  kind: "conditional",
  label: "광휘",
  hidden: true,
  style: {
   color: "#c084fc"
  }
 },
 {
  code: "ember_silk",
  kind: "conditional",
  label: "화문",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "battle_wings",
  kind: "conditional",
  label: "전장의 날개",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "holy_light",
  kind: "conditional",
  label: "성광",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "black_dragon",
  kind: "conditional",
  label: "흑룡",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "archangel_chief",
  kind: "conditional",
  label: "천사장",
  hidden: true,
  style: {
   fx: "aurora"
  }
 },
 {
  code: "forest_hermit",
  kind: "conditional",
  label: "숲의 은둔자",
  hidden: true,
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
  style: {
   color: "#e0a066"
  }
 },
 {
  code: "fast_courier",
  kind: "permanent",
  label: "신속 배달",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "all_in",
  kind: "permanent",
  label: "올인",
  hidden: true,
  style: {
   color: "#cdb04e",
   glow: true
  }
 },
 {
  code: "completionist",
  kind: "permanent",
  label: "완주",
  hidden: false,
  style: {
   color: "#80cbc4"
  }
 },
 {
  code: "evening_life",
  kind: "permanent",
  label: "황금 시간대",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "commuter",
  kind: "permanent",
  label: "출퇴근",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "day_100_party",
  kind: "permanent",
  label: "백일잔치",
  hidden: true,
  style: {
   color: "#a8a8b0"
  }
 },
 {
  code: "sprout_keeper",
  kind: "permanent",
  label: "새싹 지킴이",
  hidden: true,
  style: {
   color: "#7fb8e0"
  }
 },
 {
  code: "open_king",
  kind: "conditional",
  label: "개봉왕",
  hidden: true,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "march_live",
  kind: "conditional",
  label: "진군",
  hidden: false,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "smooth_sail",
  kind: "conditional",
  label: "순풍",
  hidden: true,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "alley_boss",
  kind: "conditional",
  label: "골목대장",
  hidden: true,
  style: {
   color: "#b9a7e0"
  }
 },
 {
  code: "red_ball",
  kind: "conditional",
  label: "붉은 무도회",
  hidden: true,
  style: {
   fx: "silk"
  }
 },
 {
  code: "gunslinger",
  kind: "conditional",
  label: "황야의 총잡이",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "phantom_thief",
  kind: "conditional",
  label: "괴도",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "star_navigator",
  kind: "conditional",
  label: "별의 항해사",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "lava_lord",
  kind: "conditional",
  label: "용암 군주",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "kings_blade",
  kind: "conditional",
  label: "왕의 검",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "marksman",
  kind: "conditional",
  label: "명포수",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "elite_few",
  kind: "conditional",
  label: "소수정예",
  hidden: false,
  style: {
   color: "#b9a7e0",
   glow: true
  }
 },
 {
  code: "david",
  kind: "permanent",
  label: "다윗",
  hidden: true,
  style: {
   color: "#e08c9c",
   glow: true
  }
 },
 {
  code: "all_nighter",
  kind: "permanent",
  label: "밤샘 작업",
  hidden: true,
  style: {
   color: "#8fb4d8"
  }
 },
 {
  code: "flawless_all",
  kind: "permanent",
  label: "대업",
  hidden: false,
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
  style: {
   color: "#a8a8b0",
   glow: true
  }
 },
 {
  code: "paper_thin",
  kind: "permanent",
  label: "종이 한 장",
  hidden: true,
  style: {
   color: "#e08c9c"
  }
 },
 {
  code: "card_shark",
  kind: "permanent",
  label: "타짜",
  hidden: true,
  style: {
   color: "#e0a066",
   glow: true
  }
 },
 {
  code: "dawn_prayer",
  kind: "conditional",
  label: "새벽 기도",
  hidden: true,
  style: {
   fx: "moonlight"
  }
 },
 {
  code: "phoenix_set",
  kind: "conditional",
  label: "봉황",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "abyss_lord",
  kind: "conditional",
  label: "심연의 군주",
  hidden: true,
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
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "light_maiden",
  kind: "conditional",
  label: "빛의 무녀",
  hidden: true,
  style: {
   fx: "aurora"
  }
 },
 {
  code: "warpath",
  kind: "conditional",
  label: "패도",
  hidden: true,
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
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "night_walk",
  kind: "conditional",
  label: "야행",
  hidden: true,
  style: {
   fx: "obsidian"
  }
 },
 {
  code: "glacier_knight",
  kind: "conditional",
  label: "빙하 기사",
  hidden: true,
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
  style: {
   color: "#f97316"
  }
 },
 {
  code: "court_mage",
  kind: "conditional",
  label: "궁정 마법사",
  hidden: true,
  style: {
   color: "#fbbf24"
  }
 },
 {
  code: "ash_judge",
  kind: "conditional",
  label: "재의 심판자",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "treasure_hunt",
  kind: "permanent",
  label: "보물찾기",
  hidden: true,
  style: {
   color: "#80cbc4",
   glow: true
  }
 },
 {
  code: "medal_collector",
  kind: "permanent",
  label: "훈장 수집가",
  hidden: false,
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
  style: {
   color: "#a8a8b0",
   glow: true
  }
 },
 {
  code: "uncrowned",
  kind: "conditional",
  label: "무관의 제왕",
  hidden: true,
  style: {
   fx: "steelshine",
   glow: true
  }
 },
 {
  code: "cbt_2026",
  kind: "tribute",
  label: "선발대",
  hidden: true,
  style: {
   fx: "staticember",
   glow: true
  }
 },
 {
  code: "fire_and_ice",
  kind: "conditional",
  label: "얼음과 불",
  hidden: true,
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
  label: "길을 비우는 걸음",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "temple_procession",
  kind: "conditional",
  label: "행렬의 선두",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "never_sheathed",
  kind: "conditional",
  label: "칼집 없는 자",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "ember_ball",
  kind: "conditional",
  label: "잿불 무도",
  hidden: true,
  style: {
   color: "#ef4444",
   glow: true
  }
 },
 {
  code: "forge_hand",
  kind: "conditional",
  label: "불을 다루는 손",
  hidden: true,
  style: {
   color: "#ef4444"
  }
 },
 {
  code: "antler_hunter",
  kind: "conditional",
  label: "뿔의 사냥꾼",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 },
 {
  code: "marsh_tracker",
  kind: "conditional",
  label: "늪을 읽는 자",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "summer_keeper",
  kind: "conditional",
  label: "여름을 든 자",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "green_circle",
  kind: "conditional",
  label: "푸른 원",
  hidden: true,
  style: {
   color: "#22c55e"
  }
 },
 {
  code: "oni_slayer",
  kind: "conditional",
  label: "귀참",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "red_edge",
  kind: "conditional",
  label: "붉은 날",
  hidden: true,
  style: {
   color: "#a5b4fc",
   glow: true
  }
 },
 {
  code: "mask_and_blade",
  kind: "conditional",
  label: "가면과 칼",
  hidden: true,
  style: {
   color: "#f97316"
  }
 },
 {
  code: "thorn_bearer",
  kind: "conditional",
  label: "가시를 쥔 자",
  hidden: true,
  style: {
   color: "#a5b4fc"
  }
 }
] as const;

export const TITLE_BY_CODE: ReadonlyMap<string, TitleDef> = new Map(TITLE_DEFS.map((t) => [t.code, t]));
