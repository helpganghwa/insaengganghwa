import 'server-only';

/**
 * 칭호 서버 전용 정의 — 획득 조건·난이도. 클라이언트로 새어나가면 안 된다(TITLES.md §3.5).
 * cond는 "발견 후" 공개용 설명 텍스트이자 판정 구현(judge.ts)의 명세.
 * 생성: bun run scripts/gen-title-defs.ts (수동 수정 금지)
 */
export type TitleSecret = { code: string; cat: string; cond: string; diff: '쉬움' | '중간' | '어려움' | '한정'; req?: { items: string[]; min: number } };

export const TITLE_SECRETS: TitleSecret[] = [
 {
  code: "rank_combat",
  cat: "랭킹 1위",
  cond: "전투력 랭킹 1위인 동안",
  diff: "어려움"
 },
 {
  code: "rank_max",
  cat: "랭킹 1위",
  cond: "최고 강화 랭킹 1위인 동안",
  diff: "어려움"
 },
 {
  code: "rank_sum",
  cat: "랭킹 1위",
  cond: "합산 강화 랭킹 1위인 동안",
  diff: "어려움"
 },
 {
  code: "rank_raid",
  cat: "랭킹 1위",
  cond: "레이드 랭킹 1위인 동안",
  diff: "어려움"
 },
 {
  code: "rank_melee",
  cat: "랭킹 1위",
  cond: "대난투 랭킹 1위인 동안",
  diff: "어려움"
 },
 {
  code: "zone_executor",
  cat: "조건부",
  cond: "구역 집행관으로 배치되어 있는 동안",
  diff: "중간"
 },
 {
  code: "melee_champion",
  cat: "조건부",
  cond: "어제 대난투 1위 — 오늘 하루 동안",
  diff: "어려움"
 },
 {
  code: "melee_shame",
  cat: "조건부",
  cond: "어제 대난투 꼴찌 — 오늘 하루 동안",
  diff: "쉬움"
 },
 {
  code: "raid_hero",
  cat: "조건부",
  cond: "어제 레이드 데미지 1위 — 오늘 하루 동안",
  diff: "어려움"
 },
 {
  code: "rich_apex",
  cat: "조건부",
  cond: "현재 서버 다이아 보유량 1위인 동안",
  diff: "어려움"
 },
 {
  code: "guild_top",
  cat: "조건부",
  cond: "길드 랭킹 1위 길드 소속인 동안",
  diff: "어려움"
 },
 {
  code: "guild_flag",
  cat: "조건부",
  cond: "길드장인 동안",
  diff: "쉬움"
 },
 {
  code: "broke_now",
  cat: "조건부",
  cond: "다이아 보유량이 정확히 0인 동안",
  diff: "쉬움"
 },
 {
  code: "codex_live",
  cat: "조건부",
  cond: "도감 완성 상태를 유지하는 동안(신규 아이템 추가 시 자동 상실)",
  diff: "어려움"
 },
 {
  code: "star_holder",
  cat: "조건부",
  cond: "+200 이상 장비를 장착 중인 동안",
  diff: "어려움"
 },
 {
  code: "full_armed",
  cat: "조건부",
  cond: "3슬롯 전부 +100 이상 장착 중인 동안",
  diff: "어려움"
 },
 {
  code: "lib_first",
  cat: "해방",
  cond: "첫 해방 달성(아이템 강화랭킹 3위 이내)",
  diff: "중간"
 },
 {
  code: "lib_holder",
  cat: "해방",
  cond: "해방 아이템 3개 이상 보유 중인 동안",
  diff: "중간"
 },
 {
  code: "lib_ten",
  cat: "해방",
  cond: "해방 아이템 10개 이상 보유 중인 동안",
  diff: "어려움"
 },
 {
  code: "champ_5",
  cat: "해방",
  cond: "아이템 챔피언(1위) 5개 이상 보유 중인 동안",
  diff: "어려움"
 },
 {
  code: "enhance_100",
  cat: "강화",
  cond: "+100 도달",
  diff: "중간"
 },
 {
  code: "enhance_200",
  cat: "강화",
  cond: "+200 도달",
  diff: "어려움"
 },
 {
  code: "win_streak",
  cat: "강화",
  cond: "강화 성공 10연속",
  diff: "중간"
 },
 {
  code: "down_streak",
  cat: "강화",
  cond: "강화 하락 5연속",
  diff: "중간"
 },
 {
  code: "down_10",
  cat: "강화",
  cond: "강화 하락 10연속",
  diff: "어려움"
 },
 {
  code: "hold_streak",
  cat: "강화",
  cond: "강화 유지 10연속",
  diff: "중간"
 },
 {
  code: "hold_20",
  cat: "강화",
  cond: "강화 유지 20연속",
  diff: "어려움"
 },
 {
  code: "phoenix",
  cat: "강화",
  cond: "강화 하락 직후 연속 성공 10회",
  diff: "중간"
 },
 {
  code: "double_joy",
  cat: "강화",
  cond: "강화 대성공 3연속",
  diff: "중간"
 },
 {
  code: "lucky_hammer",
  cat: "강화",
  cond: "강화 대성공 누적 100회",
  diff: "중간"
 },
 {
  code: "down_curse",
  cat: "강화",
  cond: "강화 하락 누적 100회",
  diff: "중간"
 },
 {
  code: "enhance_10000",
  cat: "강화",
  cond: "강화 누적 10,000회",
  diff: "어려움"
 },
 {
  code: "one_well",
  cat: "강화",
  cond: "한 장비에만 강화 누적 2,000회",
  diff: "어려움"
 },
 {
  code: "five_min",
  cat: "강화",
  cond: "강화 완료 후 5분 안에 수령 100회",
  diff: "중간"
 },
 {
  code: "aging",
  cat: "강화",
  cond: "강화 완료 후 24시간 넘게 두었다 수령 50회",
  diff: "중간"
 },
 {
  code: "balance_master",
  cat: "조건부",
  cond: "3슬롯 강화 레벨이 완전히 동일(+50 이상)한 동안",
  diff: "어려움"
 },
 {
  code: "owl",
  cat: "시간대",
  cond: "새벽 3~5시 강화 수령 30회",
  diff: "중간"
 },
 {
  code: "early_bird",
  cat: "시간대",
  cond: "아침 5~7시 강화 수령 30회",
  diff: "중간"
 },
 {
  code: "weekend",
  cat: "시간대",
  cond: "주말에 강화 수령 누적 100회",
  diff: "중간"
 },
 {
  code: "monday",
  cat: "시간대",
  cond: "월요일에 강화 하락 10회",
  diff: "중간"
 },
 {
  code: "friday",
  cat: "시간대",
  cond: "금요일 밤(20~24시) 강화 수령 100회",
  diff: "어려움"
 },
 {
  code: "supply_binge",
  cat: "보급",
  cond: "하루에 보급상자 50개 개봉",
  diff: "중간"
 },
 {
  code: "supply_5000",
  cat: "보급",
  cond: "보급상자 누적 5,000개 개봉",
  diff: "어려움"
 },
 {
  code: "supply_10000",
  cat: "보급",
  cond: "보급상자 누적 10,000개 개봉",
  diff: "어려움"
 },
 {
  code: "same_pull",
  cat: "보급",
  cond: "같은 아이템을 3연속 개봉",
  diff: "쉬움"
 },
 {
  code: "transcend_300",
  cat: "초월",
  cond: "초월 누적 300회",
  diff: "중간"
 },
 {
  code: "transcend_1000",
  cat: "초월",
  cond: "초월 누적 1,000회",
  diff: "어려움"
 },
 {
  code: "transcend_deep",
  cat: "초월",
  cond: "한 장비를 초월 30단계까지",
  diff: "어려움"
 },
 {
  code: "star_rain",
  cat: "초월",
  cond: "하루에 초월 100회",
  diff: "어려움"
 },
 {
  code: "codex_120",
  cat: "도감",
  cond: "도감 120종 전부 수집",
  diff: "어려움"
 },
 {
  code: "raid_strike",
  cat: "레이드",
  cond: "레이드 단일 공격으로 5,000,000 데미지",
  diff: "어려움"
 },
 {
  code: "raid_365",
  cat: "레이드",
  cond: "레이드 참여 365회",
  diff: "어려움"
 },
 {
  code: "raid_volcano",
  cat: "레이드",
  cond: "화산 보스 처치 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_temple",
  cat: "레이드",
  cond: "신전 보스 처치 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_swamp",
  cat: "레이드",
  cond: "늪지대 보스 처치 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_orc",
  cat: "레이드",
  cond: "오크 부락 보스 처치 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_fallen",
  cat: "레이드",
  cond: "타락천사 보스 처치 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_kingdom",
  cat: "레이드",
  cond: "왕국 보스 처치 참여 100회 — 왕국 레이드 출시 시 활성",
  diff: "어려움"
 },
 {
  code: "melee_first_win",
  cat: "대난투",
  cond: "대난투 우승(서버당 하루 1명)",
  diff: "어려움"
 },
 {
  code: "melee_30_win",
  cat: "대난투",
  cond: "대난투 우승 30회",
  diff: "어려움"
 },
 {
  code: "melee_3streak",
  cat: "대난투",
  cond: "대난투 우승 3연속",
  diff: "어려움"
 },
 {
  code: "melee_top10",
  cat: "대난투",
  cond: "대난투 상위 10% 50회",
  diff: "어려움"
 },
 {
  code: "melee_podium",
  cat: "대난투",
  cond: "대난투 3위 이내 10회",
  diff: "어려움"
 },
 {
  code: "melee_30",
  cat: "대난투",
  cond: "대난투 참가 30회",
  diff: "중간"
 },
 {
  code: "melee_comet",
  cat: "대난투",
  cond: "첫 10회 참가 안에 우승",
  diff: "중간"
 },
 {
  code: "melee_last",
  cat: "대난투",
  cond: "대난투 꼴찌 1회",
  diff: "쉬움"
 },
 {
  code: "kong_line",
  cat: "대난투",
  cond: "대난투 2위 2회",
  diff: "중간"
 },
 {
  code: "tax_collector",
  cat: "점령전",
  cond: "집행관 수금 10회",
  diff: "중간"
 },
 {
  code: "siege_30",
  cat: "점령전",
  cond: "점령전 공격 참여 누적 30회",
  diff: "중간"
 },
 {
  code: "wall",
  cat: "점령전",
  cond: "점령전 방어 성공 참여 10회",
  diff: "중간"
 },
 {
  code: "tour_lord",
  cat: "점령전",
  cond: "서로 다른 구역 3곳에서 집행관 역임",
  diff: "어려움"
 },
 {
  code: "guild_founder",
  cat: "길드",
  cond: "길드를 창설",
  diff: "쉬움"
 },
 {
  code: "guild_donate",
  cat: "길드",
  cond: "길드 기부 누적 100회",
  diff: "중간"
 },
 {
  code: "no_guild_30",
  cat: "길드",
  cond: "길드 없이 7일",
  diff: "쉬움"
 },
 {
  code: "friends_30",
  cat: "소셜",
  cond: "친구 30명",
  diff: "중간"
 },
 {
  code: "invite_20",
  cat: "소셜",
  cond: "초대로 20명 가입",
  diff: "어려움"
 },
 {
  code: "chat_1000",
  cat: "소셜",
  cond: "채팅 누적 1,000회",
  diff: "중간"
 },
 {
  code: "mention_100",
  cat: "소셜",
  cond: "채팅에서 멘션 100회 받음",
  diff: "중간"
 },
 {
  code: "checkin_30",
  cat: "일상",
  cond: "출석 누적 30일",
  diff: "중간"
 },
 {
  code: "checkin_365",
  cat: "일상",
  cond: "출석 누적 365일",
  diff: "어려움"
 },
 {
  code: "mail_1000",
  cat: "일상",
  cond: "우편 수령 누적 1,000통",
  diff: "어려움"
 },
 {
  code: "resident_10",
  cat: "일상",
  cond: "한 구역에 거주 10일",
  diff: "쉬움"
 },
 {
  code: "mover_30",
  cat: "일상",
  cond: "거주 이동 30회",
  diff: "중간"
 },
 {
  code: "time_gold",
  cat: "재화",
  cond: "다이아 시간 단축 누적 30일치",
  diff: "중간"
 },
 {
  code: "lucky_777",
  cat: "재화",
  cond: "다이아 보유량이 정확히 777인 순간",
  diff: "쉬움"
 },
 {
  code: "power_77777",
  cat: "재화",
  cond: "전투력이 정확히 77,777인 순간",
  diff: "어려움"
 },
 {
  code: "dragon_hoard",
  cat: "재화",
  cond: "다이아 10만 이상을 10일 내내 유지(무지출)",
  diff: "어려움"
 },
 {
  code: "pay_first",
  cat: "후원",
  cond: "첫 결제",
  diff: "쉬움"
 },
 {
  code: "pay_5",
  cat: "후원",
  cond: "누적 결제 5만원",
  diff: "쉬움"
 },
 {
  code: "pay_20",
  cat: "후원",
  cond: "누적 결제 20만원",
  diff: "중간"
 },
 {
  code: "pay_50",
  cat: "후원",
  cond: "누적 결제 50만원",
  diff: "어려움"
 },
 {
  code: "pay_200",
  cat: "후원",
  cond: "누적 결제 200만원",
  diff: "어려움"
 },
 {
  code: "two_mirrors",
  cat: "아바타",
  cond: "남/여 아바타 모두 생성",
  diff: "쉬움"
 },
 {
  code: "same_face_30",
  cat: "아바타",
  cond: "한 아바타를 30일 동안 유지",
  diff: "중간"
 },
 {
  code: "same_combo",
  cat: "아바타",
  cond: "같은 장비 조합으로 아바타 10회 생성",
  diff: "중간"
 },
 {
  code: "avatar_50",
  cat: "아바타",
  cond: "아바타 50개 보유",
  diff: "어려움"
 },
 {
  code: "avatar_1000",
  cat: "아바타",
  cond: "아바타 생성 1,000회",
  diff: "어려움"
 },
 {
  code: "full_course",
  cat: "조합",
  cond: "하루에 강화 수령·보급 개봉·레이드·대난투 전부 참여",
  diff: "쉬움"
 },
 {
  code: "pentagon",
  cat: "조합",
  cond: "랭킹 5종 모두 10위 이내에 드는 순간",
  diff: "어려움"
 },
 {
  code: "apex_shoot",
  cat: "조합",
  cond: "+100 이상 장비 3개를 장착하고 아바타 생성",
  diff: "어려움"
 },
 {
  code: "kintsugi_master",
  cat: "아이템 발동",
  cond: "흑금 대도를 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "general_kintsugi_katana"
   ],
   min: 100
  }
 },
 {
  code: "halfblade_master",
  cat: "아이템 발동",
  cond: "빛과 밤을 가른 대검을 +150 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "fallen_half_blade"
   ],
   min: 150
  }
 },
 {
  code: "starfield_master",
  cat: "아이템 발동",
  cond: "별자리가 흐르는 장검을 +200 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "general_starfield_blade"
   ],
   min: 200
  }
 },
 {
  code: "frog_prince",
  cat: "아이템 발동",
  cond: "퉤! 하는 대롱 + 개구리 탈 망토 + 반딧불 충전기를 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "marsh_frog_blowgun",
    "marsh_frog_hood",
    "marsh_frog_jar"
   ],
   min: 30
  }
 },
 {
  code: "true_witch",
  cat: "아이템 발동",
  cond: "마녀의 등불 + 호박등 드레스 + 마녀의 뾰족 모자를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "pumpkin_witch_staff",
    "pumpkin_witch_dress",
    "pumpkin_witch_hat"
   ],
   min: 50
  }
 },
 {
  code: "winter_itself",
  cat: "아이템 발동",
  cond: "눈꽃 대도 + 설산 파수의 갑주 + 설화의 관을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frost_odachi",
    "temple_frostguard_garb",
    "temple_snowflake_crown"
   ],
   min: 50
  }
 },
 {
  code: "dawn_knight",
  cat: "아이템 발동",
  cond: "동트는 맹세 + 여명의 벽 + 새벽지기의 표식을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_dawnguard_sword",
    "kingdom_dawnguard_cuirass",
    "kingdom_dawnguard_ring"
   ],
   min: 50
  }
 },
 {
  code: "dragon_heir",
  cat: "아이템 발동",
  cond: "포효하는 용턱 + 흑룡의 비늘갑 + 화룡의 뿔관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_dragonjaw_halberd",
    "dragonknight_scale_armor",
    "volcano_dragonhorn_circlet"
   ],
   min: 100
  }
 },
 {
  code: "crown_touch",
  cat: "강화",
  cond: "+100 도달을 대성공으로 장식",
  diff: "어려움"
 },
 {
  code: "lightning",
  cat: "강화",
  cond: "강화 시작 1분 안에 보석으로 즉시 완성 30회",
  diff: "중간"
 },
 {
  code: "pure_way",
  cat: "강화",
  cond: "보석 단축 없이 +50 도달",
  diff: "어려움"
 },
 {
  code: "enhance_1000",
  cat: "강화",
  cond: "강화 누적 1,000회",
  diff: "중간"
 },
 {
  code: "beginner_mind",
  cat: "강화",
  cond: "+100 도달 후 +1 장비를 강화",
  diff: "어려움"
 },
 {
  code: "blitz",
  cat: "강화",
  cond: "가입 7일 안에 +100 도달",
  diff: "어려움"
 },
 {
  code: "fire_play",
  cat: "강화",
  cond: "하루에 강화 시도 200회",
  diff: "중간"
 },
 {
  code: "curse_of_9",
  cat: "강화",
  cond: "9로 끝나는 레벨(+9·+19·+29…)에서 하락 10회",
  diff: "중간"
 },
 {
  code: "eclipse",
  cat: "초월",
  cond: "한 장비를 초월 50단계까지",
  diff: "어려움"
 },
 {
  code: "galaxy",
  cat: "초월",
  cond: "초월 누적 3,000회",
  diff: "어려움"
 },
 {
  code: "vanguard",
  cat: "레이드",
  cond: "레이드에서 첫 번째로 공격 30회",
  diff: "중간"
 },
 {
  code: "continent_sweep",
  cat: "레이드",
  cond: "6개 지역 보스를 각 10회씩 처치 참여",
  diff: "어려움"
 },
 {
  code: "iron_man",
  cat: "대난투",
  cond: "대난투 참가 365회",
  diff: "어려움"
 },
 {
  code: "sprint",
  cat: "대난투",
  cond: "대난투 상위 10% 5연속",
  diff: "어려움"
 },
 {
  code: "ram",
  cat: "점령전",
  cond: "점령전 공격 승리 참여 30회",
  diff: "중간"
 },
 {
  code: "iron_wall",
  cat: "점령전",
  cond: "점령전 방어 성공 참여 30회",
  diff: "어려움"
 },
 {
  code: "witness",
  cat: "길드",
  cond: "한 길드에 소속 100일",
  diff: "중간"
 },
 {
  code: "homecoming",
  cat: "길드",
  cond: "길드 탈퇴 후 같은 길드에 재가입",
  diff: "쉬움"
 },
 {
  code: "pillar",
  cat: "길드",
  cond: "길드 기부 누적 365회",
  diff: "어려움"
 },
 {
  code: "surpassed",
  cat: "소셜",
  cond: "내가 초대한 유저의 전투력이 나를 넘어섬",
  diff: "어려움"
 },
 {
  code: "welcome_crowd",
  cat: "소셜",
  cond: "내가 초대한 유저가 +50 도달",
  diff: "어려움"
 },
 {
  code: "night_talk",
  cat: "소셜",
  cond: "새벽(0~5시) 채팅 100회",
  diff: "중간"
 },
 {
  code: "comeback",
  cat: "일상",
  cond: "7일 이상 미접속 후 복귀",
  diff: "쉬움"
 },
 {
  code: "time_capsule",
  cat: "일상",
  cond: "가입 365일 경과",
  diff: "어려움"
 },
 {
  code: "bottomless",
  cat: "재화",
  cond: "하루에 다이아 10,000 소비",
  diff: "중간"
 },
 {
  code: "billionaire",
  cat: "재화",
  cond: "다이아 누적 획득 1,000,000",
  diff: "어려움"
 },
 {
  code: "rebirth",
  cat: "아바타",
  cond: "아바타 생성 100회",
  diff: "어려움"
 },
 {
  code: "one_suit",
  cat: "아바타",
  cond: "한 아바타를 100일 유지",
  diff: "어려움"
 },
 {
  code: "disguise",
  cat: "아바타",
  cond: "서로 다른 장비 조합 30가지로 아바타 생성",
  diff: "어려움"
 },
 {
  code: "model_student",
  cat: "아이템 발동",
  cond: "왕립 학원 교복 + 금테 둥근 안경을 +10 이상으로 동시 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "academy_student_uniform",
    "round_gold_glasses"
   ],
   min: 10
  }
 },
 {
  code: "night_noble",
  cat: "아이템 발동",
  cond: "진홍의 가는 검 + 진홍 레이스 드레스 + 상아 반가면을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "vampire_blood_rapier",
    "crimson_gothic_dress",
    "phantom_half_mask"
   ],
   min: 50
  }
 },
 {
  code: "valkyrie",
  cat: "아이템 발동",
  cond: "왕기의 창 + 창공의 전투복 + 발키리의 날개 서클릿을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_banner_spear",
    "valkyrie_battle_dress",
    "valkyrie_winged_circlet"
   ],
   min: 70
  }
 },
 {
  code: "grim_envoy",
  cat: "아이템 발동",
  cond: "혼불낫 + 갈까마귀 로브 + 재가 흐르는 모래시계를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "reaper_soul_scythe",
    "necromancer_raven_robe",
    "volcano_ember_hourglass"
   ],
   min: 70
  }
 },
 {
  code: "archangel",
  cat: "아이템 발동",
  cond: "해오름검 + 아침빛 예복 + 하얀 깃 날개를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "celestial_dawn_greatsword",
    "angel_radiant_gown",
    "angel_glide_wings"
   ],
   min: 70
  }
 },
 {
  code: "outlaw",
  cat: "아이템 발동",
  cond: "금당초 쌍권총을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "general_twin_flintlocks"
   ],
   min: 100
  }
 },
 {
  code: "sharpshooter",
  cat: "아이템 발동",
  cond: "봄을 겨눈 석궁을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "temple_frostward_bow"
   ],
   min: 100
  }
 },
 {
  code: "gatekeeper",
  cat: "아이템 발동",
  cond: "봉문검을 +150 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "vault_key_greatsword"
   ],
   min: 150
  }
 },
 {
  code: "armory_lord",
  cat: "해방",
  cond: "무기 10종 이상 해방 보유 중인 동안",
  diff: "어려움"
 },
 {
  code: "throne_shadow",
  cat: "랭킹 1위",
  cond: "아무 랭킹이든 2위인 동안",
  diff: "어려움"
 },
 {
  code: "sword_and_pen",
  cat: "조합",
  cond: "도감 100종 + 전투력 100,000 동시 달성",
  diff: "어려움"
 },
 {
  code: "enhance_150",
  cat: "강화",
  cond: "+150 도달",
  diff: "어려움"
 },
 {
  code: "morning_ration",
  cat: "보급",
  cond: "오전 9시 전 상자 개봉 100회",
  diff: "중간"
 },
 {
  code: "three_meals",
  cat: "보급",
  cond: "하루에 무기·방어구·장신구 상자를 각각 개봉 — 30일 달성",
  diff: "어려움"
 },
 {
  code: "assault_100",
  cat: "점령전",
  cond: "점령전 공격 참여 100회",
  diff: "어려움"
 },
 {
  code: "guardian_100",
  cat: "점령전",
  cond: "점령전 방어 성공 참여 100회",
  diff: "어려움"
 },
 {
  code: "raid_100days",
  cat: "레이드",
  cond: "100일 연속 레이드 참여",
  diff: "어려움"
 },
 {
  code: "winter_blade",
  cat: "아이템 발동",
  cond: "눈꽃 대도를 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "temple_frost_odachi"
   ],
   min: 100
  }
 },
 {
  code: "volcano_heart",
  cat: "아이템 발동",
  cond: "용암을 가둔 대검을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_emberveined_greatsword"
   ],
   min: 100
  }
 },
 {
  code: "lotus_warrior",
  cat: "아이템 발동",
  cond: "피어나는 삼지창을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_lotus_trident"
   ],
   min: 50
  }
 },
 {
  code: "star_mage",
  cat: "아이템 발동",
  cond: "유성의 지팡이를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_star_wand"
   ],
   min: 50
  }
 },
 {
  code: "thunder_emperor",
  cat: "아이템 발동",
  cond: "벼락을 박은 창을 +150 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "thunder_emperor_spear"
   ],
   min: 150
  }
 },
 {
  code: "one_shot",
  cat: "아이템 발동",
  cond: "상아빛 한 발을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "ivory_flintlock_pistol"
   ],
   min: 70
  }
 },
 {
  code: "blue_sky",
  cat: "아이템 발동",
  cond: "창천검을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "kingdom_ribbon_rapier"
   ],
   min: 10
  }
 },
 {
  code: "phoenix_archer",
  cat: "아이템 발동",
  cond: "재에서 당기는 활을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_phoenix_bow"
   ],
   min: 70
  }
 },
 {
  code: "spiral_rider",
  cat: "아이템 발동",
  cond: "나선을 감은 랜스를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "general_spiral_lance"
   ],
   min: 50
  }
 },
 {
  code: "frost_archer",
  cat: "아이템 발동",
  cond: "고드름이 자란 장궁을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_icicle_longbow"
   ],
   min: 70
  }
 },
 {
  code: "shaman",
  cat: "아이템 발동",
  cond: "묻지 않는 지팡이 + 깃털 두른 침묵 + 조상의 얼굴을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_shaman_staff",
    "orc_shaman_robe",
    "orc_ancestor_mask"
   ],
   min: 30
  }
 },
 {
  code: "angler",
  cat: "아이템 발동",
  cond: "도롱이 + 반딧불 통발을 +1 이상으로 동시 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "marsh_angler_cape",
    "marsh_angler_creel"
   ],
   min: 1
  }
 },
 {
  code: "paladin",
  cat: "아이템 발동",
  cond: "성광 갑주 + 백은 날개 투구를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "paladin_holy_armor",
    "paladin_winged_helm"
   ],
   min: 70
  }
 },
 {
  code: "astrologer",
  cat: "아이템 발동",
  cond: "성좌의 망토 + 대답하지 않는 나침반 + 유성의 지팡이를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "astrologer_starmap_coat",
    "kingdom_riddle_astrolabe",
    "angel_star_wand"
   ],
   min: 50
  }
 },
 {
  code: "masquerade",
  cat: "아이템 발동",
  cond: "무도회의 한 수 + 이름 없는 드레스 + 이름을 가린 가면을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_masque_saber",
    "kingdom_masque_gown",
    "kingdom_masque_mask"
   ],
   min: 30
  }
 },
 {
  code: "headmaster",
  cat: "아이템 발동",
  cond: "학장복 + 금테 둥근 안경을 +10 이상으로 동시 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "academy_professor_robe",
    "round_gold_glasses"
   ],
   min: 10
  }
 },
 {
  code: "coronation",
  cat: "아이템 발동",
  cond: "왕을 짊어진 대검 + 별을 두른 망토 + 별이 박힌 왕관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "kingdom_coronation_mace",
    "kingdom_regalia_cloak",
    "kingdom_regalia_crown"
   ],
   min: 100
  }
 },
 {
  code: "perpetual",
  cat: "강화",
  cond: "30일 연속 매일 강화 수령",
  diff: "중간"
 },
 {
  code: "new_record",
  cat: "강화",
  cond: "서버 최고 강화 기록 경신",
  diff: "어려움"
 },
 {
  code: "cliff_edge",
  cat: "강화",
  cond: "+199에서 하락",
  diff: "어려움"
 },
 {
  code: "flawless_100",
  cat: "강화",
  cond: "+90에서 +100까지 하락 없이 도달",
  diff: "중간"
 },
 {
  code: "midnight_snack",
  cat: "보급",
  cond: "자정~새벽 2시 상자 개봉 50회",
  diff: "중간"
 },
 {
  code: "meteor_shower",
  cat: "초월",
  cond: "하루에 초월 30회",
  diff: "중간"
 },
 {
  code: "month_war",
  cat: "대난투",
  cond: "30일 연속 대난투 참가",
  diff: "어려움"
 },
 {
  code: "fire_support",
  cat: "레이드",
  cond: "친구와 같은 레이드에 참여 50회",
  diff: "중간"
 },
 {
  code: "initiation",
  cat: "아바타",
  cond: "가입 3일 안에 첫 아바타 생성",
  diff: "쉬움"
 },
 {
  code: "dust_to_mountain",
  cat: "재화",
  cond: "무료 다이아 누적 100,000 수급",
  diff: "어려움"
 },
 {
  code: "old_friend",
  cat: "소셜",
  cond: "한 친구와 친구 관계 90일 유지",
  diff: "중간"
 },
 {
  code: "streak_king",
  cat: "일상",
  cond: "30일 연속 출석을 유지 중인 동안",
  diff: "중간"
 },
 {
  code: "frog_sniper",
  cat: "아이템 발동",
  cond: "퉤! 하는 대롱을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "marsh_frog_blowgun"
   ],
   min: 10
  }
 },
 {
  code: "gentleman",
  cat: "아이템 발동",
  cond: "매 머리 지팡이검을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_falcon_cane_sword"
   ],
   min: 30
  }
 },
 {
  code: "cupid",
  cat: "아이템 발동",
  cond: "두근 화살을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_cherub_bow"
   ],
   min: 30
  }
 },
 {
  code: "hunter",
  cat: "아이템 발동",
  cond: "돌아오는 뼈를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_hunter_boomerang"
   ],
   min: 30
  }
 },
 {
  code: "twin_saber",
  cat: "아이템 발동",
  cond: "청홍 쌍검을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_court_twin_sabers"
   ],
   min: 50
  }
 },
 {
  code: "standard_bearer",
  cat: "아이템 발동",
  cond: "왕기의 창을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_banner_spear"
   ],
   min: 50
  }
 },
 {
  code: "ash_reaper",
  cat: "아이템 발동",
  cond: "잿불낫을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_ember_scythe"
   ],
   min: 50
  }
 },
 {
  code: "dusk",
  cat: "아이템 발동",
  cond: "노을이 앉는 검을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_duskwing_sword"
   ],
   min: 50
  }
 },
 {
  code: "sky_knight",
  cat: "아이템 발동",
  cond: "창궁검을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_winged_coronation_sword"
   ],
   min: 70
  }
 },
 {
  code: "dragon_slayer",
  cat: "아이템 발동",
  cond: "포효하는 용턱을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_dragonjaw_halberd"
   ],
   min: 70
  }
 },
 {
  code: "shadow",
  cat: "아이템 발동",
  cond: "쌍익 단검을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "assassin_twin_daggers"
   ],
   min: 70
  }
 },
 {
  code: "forge_heart",
  cat: "아이템 발동",
  cond: "화심의 망치를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_forgeheart_warhammer"
   ],
   min: 70
  }
 },
 {
  code: "grim_reaper",
  cat: "아이템 발동",
  cond: "혼불낫을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "reaper_soul_scythe"
   ],
   min: 100
  }
 },
 {
  code: "necromancer",
  cat: "아이템 발동",
  cond: "초혼의 해골장을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "necromancer_skull_staff"
   ],
   min: 100
  }
 },
 {
  code: "morning_blade",
  cat: "아이템 발동",
  cond: "해오름검을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "celestial_dawn_greatsword"
   ],
   min: 100
  }
 },
 {
  code: "twin_wings",
  cat: "아이템 발동",
  cond: "한 쌍의 깃을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "fallen_pinion_twinblades"
   ],
   min: 100
  }
 },
 {
  code: "fallen_angel",
  cat: "아이템 발동",
  cond: "날개였던 대궁을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "fallen_grace_greatbow"
   ],
   min: 100
  }
 },
 {
  code: "wanderer",
  cat: "아이템 발동",
  cond: "모래바람의 겹옷 + 용비늘 가방 + 돌아오는 뼈를 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "desert_nomad_robes",
    "volcano_dragonscale_satchel",
    "orc_hunter_boomerang"
   ],
   min: 30
  }
 },
 {
  code: "little_angel",
  cat: "아이템 발동",
  cond: "두근 화살 + 구름 갑옷 + 철사로 띄운 후광을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_cherub_bow",
    "angel_cherub_armor",
    "temple_faux_halo"
   ],
   min: 30
  }
 },
 {
  code: "lily_spirit",
  cat: "아이템 발동",
  cond: "피어나는 삼지창 + 수련이 피는 드레스 + 수련 화관을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_lotus_trident",
    "marsh_lily_gown",
    "swamp_lily_crown"
   ],
   min: 50
  }
 },
 {
  code: "fire_dancer",
  cat: "아이템 발동",
  cond: "춤추는 쌍불꽃 + 불길 케이프 + 흑요 봉황선을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_dancer_daggers",
    "volcano_dancer_cape",
    "volcano_obsidian_warfan"
   ],
   min: 50
  }
 },
 {
  code: "frost_warden",
  cat: "아이템 발동",
  cond: "봄을 겨눈 석궁 + 설산 파수의 갑주 + 빙정 방패를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frostward_bow",
    "temple_frostguard_garb",
    "frost_kite_shield"
   ],
   min: 70
  }
 },
 {
  code: "beast_king",
  cat: "아이템 발동",
  cond: "돌아오는 뼈 + 냄새를 덮는 가죽옷 + 손목에 감은 조상을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_hunter_boomerang",
    "general_beastmaster_hide",
    "orc_ancestor_bracelet"
   ],
   min: 70
  }
 },
 {
  code: "royal_guard",
  cat: "아이템 발동",
  cond: "창궁검 + 쪽빛 기사복 + 푸른 깃 견장을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_winged_coronation_sword",
    "kingdom_azure_outfit",
    "commander_feather_epaulets"
   ],
   min: 70
  }
 },
 {
  code: "fallen_lord",
  cat: "아이템 발동",
  cond: "빛과 밤을 가른 대검 + 도금이 벗겨진 갑주 + 한 뼘짜리 마왕 날개를 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "fallen_half_blade",
    "fallen_gilded_ruin_plate",
    "general_imp_wings"
   ],
   min: 100
  }
 },
 {
  code: "rising_star",
  cat: "조건부",
  cond: "가입 30일 이내 + 전투력 100위 이내인 동안",
  diff: "어려움"
 },
 {
  code: "big_family",
  cat: "조건부",
  cond: "길드 인원이 만석인 동안",
  diff: "중간"
 },
 {
  code: "top_patron",
  cat: "조건부",
  cond: "서버 누적 결제액 1위인 동안",
  diff: "어려움"
 },
 {
  code: "doremi",
  cat: "재화",
  cond: "다이아 보유량이 정확히 12,345인 순간",
  diff: "중간"
 },
 {
  code: "army_100k",
  cat: "재화",
  cond: "전투력 100,000 달성",
  diff: "어려움"
 },
 {
  code: "seven_falls",
  cat: "강화",
  cond: "한 장비가 하락 누적 7회를 딛고 +100 도달",
  diff: "어려움"
 },
 {
  code: "reincarnation",
  cat: "강화",
  cond: "+199에서 하락한 장비를 다시 +200까지",
  diff: "어려움"
 },
 {
  code: "insomnia",
  cat: "시간대",
  cond: "새벽 0~6시에만 강화 수령한 날 7일",
  diff: "어려움"
 },
 {
  code: "night_watch",
  cat: "시간대",
  cond: "새벽 0~6시 레이드 공격 50회",
  diff: "중간"
 },
 {
  code: "weekend_raid",
  cat: "시간대",
  cond: "주말 레이드 참여 100회",
  diff: "중간"
 },
 {
  code: "king_return",
  cat: "대난투",
  cond: "우승 후 7일 넘게 지나 다시 우승",
  diff: "어려움"
 },
 {
  code: "big_eater",
  cat: "일상",
  cond: "하루에 우편 50통 수령",
  diff: "중간"
 },
 {
  code: "triathlon",
  cat: "조합",
  cond: "하루에 레이드·대난투·점령전 전부 참여",
  diff: "중간"
 },
 {
  code: "seraph",
  cat: "아이템 발동",
  cond: "세라핌의 갑주를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_seraphguard_armor"
   ],
   min: 70
  }
 },
 {
  code: "black_knight",
  cat: "아이템 발동",
  cond: "적금 갑주를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_goldknight_plate"
   ],
   min: 50
  }
 },
 {
  code: "field_marshal",
  cat: "아이템 발동",
  cond: "금장 군복을 +100 이상으로 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "royal_military_coat"
   ],
   min: 100
  }
 },
 {
  code: "snow_priest",
  cat: "아이템 발동",
  cond: "설야 예복을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_breathwoven_vestment"
   ],
   min: 50
  }
 },
 {
  code: "firebird",
  cat: "아이템 발동",
  cond: "불새 깃 드레스를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "phoenix_dancer_dress"
   ],
   min: 70
  }
 },
 {
  code: "forest_keeper",
  cat: "아이템 발동",
  cond: "숲지기의 한 벌을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "forest_ranger_outfit"
   ],
   min: 30
  }
 },
 {
  code: "star_reader",
  cat: "아이템 발동",
  cond: "별을 읽는 외투를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_riddle_coat"
   ],
   min: 50
  }
 },
 {
  code: "penitent",
  cat: "아이템 발동",
  cond: "사슬과 한쪽 날개를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_penitent_drape"
   ],
   min: 70
  }
 },
 {
  code: "bog_warden",
  cat: "아이템 발동",
  cond: "늪빛 흉갑을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "marsh_bogwarden_chest"
   ],
   min: 50
  }
 },
 {
  code: "ascetic",
  cat: "아이템 발동",
  cond: "한쪽 어깨 띠를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_monk_sash"
   ],
   min: 30
  }
 },
 {
  code: "lion_knight",
  cat: "아이템 발동",
  cond: "백금 사자 갑주를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_lionguard_plate"
   ],
   min: 70
  }
 },
 {
  code: "herald",
  cat: "아이템 발동",
  cond: "푸른 서약 기사복을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_herald_tabard"
   ],
   min: 50
  }
 },
 {
  code: "bog_witch",
  cat: "아이템 발동",
  cond: "이끼 자란 넝마 드레스를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_bogwitch_rags"
   ],
   min: 50
  }
 },
 {
  code: "self_saint",
  cat: "아이템 발동",
  cond: "자칭 훈장 사제복을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_faux_robe"
   ],
   min: 30
  }
 },
 {
  code: "lava_dancer",
  cat: "아이템 발동",
  cond: "용암으로 짠 드레스를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_gala_gown"
   ],
   min: 70
  }
 },
 {
  code: "vampire",
  cat: "아이템 발동",
  cond: "진홍의 가는 검을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "vampire_blood_rapier"
   ],
   min: 70
  }
 },
 {
  code: "lantern_keeper",
  cat: "아이템 발동",
  cond: "마녀의 등불을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "pumpkin_witch_staff"
   ],
   min: 30
  }
 },
 {
  code: "herbalist",
  cat: "아이템 발동",
  cond: "약초꾼의 버섯 모자를 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "swamp_mushroom_hat"
   ],
   min: 10
  }
 },
 {
  code: "little_devil",
  cat: "아이템 발동",
  cond: "작은 악마의 뿔을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "devil_horn_headband"
   ],
   min: 10
  }
 },
 {
  code: "drunkard",
  cat: "아이템 발동",
  cond: "한 잔의 보람을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "orc_grumble_tankard"
   ],
   min: 10
  }
 },
 {
  code: "feather_style",
  cat: "아이템 발동",
  cond: "백은 깃 머리핀을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "general_wing_hairclip"
   ],
   min: 10
  }
 },
 {
  code: "one_eye",
  cat: "아이템 발동",
  cond: "가려야 보이는 안대를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "general_star_eyepatch"
   ],
   min: 30
  }
 },
 {
  code: "trumpeter",
  cat: "아이템 발동",
  cond: "부르면 모이는 뿔피리를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "marsh_bogwarden_horn"
   ],
   min: 30
  }
 },
 {
  code: "drummer",
  cat: "아이템 발동",
  cond: "북이 된 방패를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_drum_shield"
   ],
   min: 30
  }
 },
 {
  code: "court_dancer",
  cat: "아이템 발동",
  cond: "진홍 봉황선을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_court_fan"
   ],
   min: 30
  }
 },
 {
  code: "tribal_banner",
  cat: "아이템 발동",
  cond: "조상의 깃발을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_shaman_banner"
   ],
   min: 30
  }
 },
 {
  code: "mechanic",
  cat: "아이템 발동",
  cond: "재를 막는 눈을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_ashglass_goggles"
   ],
   min: 30
  }
 },
 {
  code: "ice_heart",
  cat: "아이템 발동",
  cond: "식지 않는 심장을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frostward_orb"
   ],
   min: 50
  }
 },
 {
  code: "iron_fist",
  cat: "아이템 발동",
  cond: "맹세를 쥔 손을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_coronation_gauntlets"
   ],
   min: 50
  }
 },
 {
  code: "lion_heart",
  cat: "아이템 발동",
  cond: "사자의 증표를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_coronation_medallion"
   ],
   min: 50
  }
 },
 {
  code: "fur_collar",
  cat: "아이템 발동",
  cond: "설백 목도리를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_fur_stole"
   ],
   min: 30
  }
 },
 {
  code: "incense_keeper",
  cat: "아이템 발동",
  cond: "흔들리는 향로를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_monk_censer"
   ],
   min: 30
  }
 },
 {
  code: "dragon_face",
  cat: "아이템 발동",
  cond: "용면 투구를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "dragonknight_horned_helm"
   ],
   min: 70
  }
 },
 {
  code: "snow_monk",
  cat: "아이템 발동",
  cond: "눈꽃 대도 + 설야 예복 + 흔들리는 향로를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frost_odachi",
    "temple_breathwoven_vestment",
    "temple_monk_censer"
   ],
   min: 50
  }
 },
 {
  code: "fallen_priest",
  cat: "아이템 발동",
  cond: "초혼의 해골장 + 자칭 훈장 사제복 + 철사로 띄운 후광을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "necromancer_skull_staff",
    "temple_faux_robe",
    "temple_faux_halo"
   ],
   min: 70
  }
 },
 {
  code: "volcano_smith",
  cat: "아이템 발동",
  cond: "화심의 망치 + 적금 갑주 + 재를 막는 눈을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_forgeheart_warhammer",
    "kingdom_goldknight_plate",
    "volcano_ashglass_goggles"
   ],
   min: 50
  }
 },
 {
  code: "thunder_general",
  cat: "아이템 발동",
  cond: "벼락을 박은 창 + 금장 군복 + 푸른 깃 견장을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "thunder_emperor_spear",
    "royal_military_coat",
    "commander_feather_epaulets"
   ],
   min: 100
  }
 },
 {
  code: "night_visitor",
  cat: "아이템 발동",
  cond: "쌍익 단검 + 늪빛 흉갑 + 상아 반가면을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "assassin_twin_daggers",
    "marsh_bogwarden_chest",
    "phantom_half_mask"
   ],
   min: 50
  }
 },
 {
  code: "honor_student",
  cat: "아이템 발동",
  cond: "왕립 학원 교복을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "academy_student_uniform"
   ],
   min: 10
  }
 },
 {
  code: "fluffy_cloud",
  cat: "아이템 발동",
  cond: "구름 갑옷을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "angel_cherub_armor"
   ],
   min: 10
  }
 },
 {
  code: "frog_person",
  cat: "아이템 발동",
  cond: "개구리 탈 망토를 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "marsh_frog_hood"
   ],
   min: 10
  }
 },
 {
  code: "peddler",
  cat: "아이템 발동",
  cond: "용비늘 가방을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "volcano_dragonscale_satchel"
   ],
   min: 10
  }
 },
 {
  code: "flower_crown",
  cat: "아이템 발동",
  cond: "수련 화관을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "swamp_lily_crown"
   ],
   min: 10
  }
 },
 {
  code: "pointy_hat",
  cat: "아이템 발동",
  cond: "마녀의 뾰족 모자를 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "pumpkin_witch_hat"
   ],
   min: 10
  }
 },
 {
  code: "bookworm",
  cat: "아이템 발동",
  cond: "금테 둥근 안경을 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "round_gold_glasses"
   ],
   min: 10
  }
 },
 {
  code: "firefly",
  cat: "아이템 발동",
  cond: "반딧불 충전기를 +10 이상으로 장착 중인 동안",
  diff: "쉬움",
  req: {
   items: [
    "marsh_frog_jar"
   ],
   min: 10
  }
 },
 {
  code: "azure_knight",
  cat: "아이템 발동",
  cond: "쪽빛 기사복을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_azure_outfit"
   ],
   min: 30
  }
 },
 {
  code: "pumpkin_glow",
  cat: "아이템 발동",
  cond: "호박등 드레스를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "pumpkin_witch_dress"
   ],
   min: 30
  }
 },
 {
  code: "old_professor",
  cat: "아이템 발동",
  cond: "학장복을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "academy_professor_robe"
   ],
   min: 30
  }
 },
 {
  code: "silence",
  cat: "아이템 발동",
  cond: "깃털 두른 침묵을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_shaman_robe"
   ],
   min: 30
  }
 },
 {
  code: "lily_pad",
  cat: "아이템 발동",
  cond: "수련이 피는 드레스를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "marsh_lily_gown"
   ],
   min: 30
  }
 },
 {
  code: "ball_night",
  cat: "아이템 발동",
  cond: "이름 없는 드레스를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_masque_gown"
   ],
   min: 30
  }
 },
 {
  code: "white_feather",
  cat: "아이템 발동",
  cond: "하얀 깃 날개를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_glide_wings"
   ],
   min: 30
  }
 },
 {
  code: "hourglass",
  cat: "아이템 발동",
  cond: "재가 흐르는 모래시계를 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_ember_hourglass"
   ],
   min: 30
  }
 },
 {
  code: "ancestor",
  cat: "아이템 발동",
  cond: "손목에 감은 조상을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_ancestor_bracelet"
   ],
   min: 30
  }
 },
 {
  code: "star_gazer",
  cat: "아이템 발동",
  cond: "대답하지 않는 나침반을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_riddle_astrolabe"
   ],
   min: 30
  }
 },
 {
  code: "nomad_fox",
  cat: "아이템 발동",
  cond: "모래바람의 겹옷을 +30 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "desert_nomad_robes"
   ],
   min: 30
  }
 },
 {
  code: "red_night",
  cat: "아이템 발동",
  cond: "진홍 레이스 드레스를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "crimson_gothic_dress"
   ],
   min: 50
  }
 },
 {
  code: "raven",
  cat: "아이템 발동",
  cond: "갈까마귀 로브를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "necromancer_raven_robe"
   ],
   min: 50
  }
 },
 {
  code: "starlight_cloak",
  cat: "아이템 발동",
  cond: "별을 두른 망토를 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_regalia_cloak"
   ],
   min: 50
  }
 },
 {
  code: "snow_flower",
  cat: "아이템 발동",
  cond: "설화의 관을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_snowflake_crown"
   ],
   min: 50
  }
 },
 {
  code: "fire_dragon",
  cat: "아이템 발동",
  cond: "화룡의 뿔관을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_dragonhorn_circlet"
   ],
   min: 50
  }
 },
 {
  code: "obsidian",
  cat: "아이템 발동",
  cond: "흑요 봉황선을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_obsidian_warfan"
   ],
   min: 50
  }
 },
 {
  code: "radiance",
  cat: "아이템 발동",
  cond: "아침빛 예복을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_radiant_gown"
   ],
   min: 50
  }
 },
 {
  code: "ember_silk",
  cat: "아이템 발동",
  cond: "화문 예복을 +50 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_embersilk_dress"
   ],
   min: 50
  }
 },
 {
  code: "battle_wings",
  cat: "아이템 발동",
  cond: "창공의 전투복을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "valkyrie_battle_dress"
   ],
   min: 70
  }
 },
 {
  code: "holy_light",
  cat: "아이템 발동",
  cond: "성광 갑주를 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "paladin_holy_armor"
   ],
   min: 70
  }
 },
 {
  code: "black_dragon",
  cat: "아이템 발동",
  cond: "흑룡의 비늘갑을 +70 이상으로 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "dragonknight_scale_armor"
   ],
   min: 70
  }
 },
 {
  code: "archangel_chief",
  cat: "아이템 발동",
  cond: "해오름검 + 세라핌의 갑주 + 하얀 깃 날개를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "celestial_dawn_greatsword",
    "angel_seraphguard_armor",
    "angel_glide_wings"
   ],
   min: 70
  }
 },
 {
  code: "forest_hermit",
  cat: "아이템 발동",
  cond: "돌아오는 뼈 + 숲지기의 한 벌 + 약초꾼의 버섯 모자를 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_hunter_boomerang",
    "forest_ranger_outfit",
    "swamp_mushroom_hat"
   ],
   min: 30
  }
 },
 {
  code: "carefree",
  cat: "강화",
  cond: "강화 완료 후 7일 넘게 두었다 수령",
  diff: "중간"
 },
 {
  code: "fast_courier",
  cat: "일상",
  cond: "우편 도착 5분 안에 수령 100회",
  diff: "중간"
 },
 {
  code: "all_in",
  cat: "재화",
  cond: "하루에 다이아 100,000 이상 소비",
  diff: "어려움"
 },
 {
  code: "completionist",
  cat: "조합",
  cond: "도전과제 전 항목 완료",
  diff: "중간"
 },
 {
  code: "evening_life",
  cat: "시간대",
  cond: "저녁 6~9시 강화 수령 100회",
  diff: "중간"
 },
 {
  code: "commuter",
  cat: "시간대",
  cond: "오전 9시대와 오후 6시대에 모두 강화 수령한 날 30일",
  diff: "중간"
 },
 {
  code: "day_100_party",
  cat: "일상",
  cond: "가입 100일째 되는 날 접속",
  diff: "중간"
 },
 {
  code: "sprout_keeper",
  cat: "소셜",
  cond: "가입 7일 이내 신규 유저와 친구 맺기 10명",
  diff: "중간"
 },
 {
  code: "open_king",
  cat: "조건부",
  cond: "어제 보급상자 최다 개봉자 — 오늘 하루 동안",
  diff: "중간"
 },
 {
  code: "march_live",
  cat: "조건부",
  cond: "7일 연속 레이드 참여를 유지 중인 동안",
  diff: "중간"
 },
 {
  code: "smooth_sail",
  cat: "조건부",
  cond: "최근 강화 20회 연속 하락 없음을 유지 중인 동안",
  diff: "중간"
 },
 {
  code: "alley_boss",
  cat: "조건부",
  cond: "거주 구역 주민 중 전투력 1위인 동안",
  diff: "중간"
 },
 {
  code: "red_ball",
  cat: "아이템 발동",
  cond: "무도회의 한 수 + 진홍 레이스 드레스 + 진홍 봉황선을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_masque_saber",
    "crimson_gothic_dress",
    "kingdom_court_fan"
   ],
   min: 50
  }
 },
 {
  code: "frost_queen",
  cat: "아이템 발동",
  cond: "고드름이 자란 장궁 + 설야 예복 + 설화의 관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "temple_icicle_longbow",
    "temple_breathwoven_vestment",
    "temple_snowflake_crown"
   ],
   min: 100
  }
 },
 {
  code: "gunslinger",
  cat: "아이템 발동",
  cond: "금당초 쌍권총 + 모래바람의 겹옷 + 재를 막는 눈을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "general_twin_flintlocks",
    "desert_nomad_robes",
    "volcano_ashglass_goggles"
   ],
   min: 50
  }
 },
 {
  code: "phantom_thief",
  cat: "아이템 발동",
  cond: "상아빛 한 발 + 별을 읽는 외투 + 상아 반가면을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "ivory_flintlock_pistol",
    "kingdom_riddle_coat",
    "phantom_half_mask"
   ],
   min: 50
  }
 },
 {
  code: "star_navigator",
  cat: "아이템 발동",
  cond: "별자리가 흐르는 장검 + 성좌의 망토 + 별이 박힌 왕관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "general_starfield_blade",
    "astrologer_starmap_coat",
    "kingdom_regalia_crown"
   ],
   min: 100
  }
 },
 {
  code: "lancer",
  cat: "아이템 발동",
  cond: "나선을 감은 랜스 + 백금 사자 갑주 + 사자의 증표를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "general_spiral_lance",
    "kingdom_lionguard_plate",
    "kingdom_coronation_medallion"
   ],
   min: 70
  }
 },
 {
  code: "forest_witch",
  cat: "아이템 발동",
  cond: "마녀의 등불 + 이끼 자란 넝마 드레스 + 약초꾼의 버섯 모자를 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "pumpkin_witch_staff",
    "swamp_bogwitch_rags",
    "swamp_mushroom_hat"
   ],
   min: 30
  }
 },
 {
  code: "lava_lord",
  cat: "아이템 발동",
  cond: "용암을 가둔 대검 + 화문 예복 + 화룡의 뿔관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_emberveined_greatsword",
    "volcano_embersilk_dress",
    "volcano_dragonhorn_circlet"
   ],
   min: 100
  }
 },
 {
  code: "gardener",
  cat: "아이템 발동",
  cond: "피어나는 삼지창 + 숲지기의 한 벌 + 수련 화관을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_lotus_trident",
    "forest_ranger_outfit",
    "swamp_lily_crown"
   ],
   min: 30
  }
 },
 {
  code: "kings_blade",
  cat: "아이템 발동",
  cond: "왕을 짊어진 대검 + 금장 군복 + 맹세를 쥔 손을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_coronation_mace",
    "royal_military_coat",
    "kingdom_coronation_gauntlets"
   ],
   min: 70
  }
 },
 {
  code: "marksman",
  cat: "아이템 발동",
  cond: "재에서 당기는 활 + 냄새를 덮는 가죽옷 + 용비늘 가방을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_phoenix_bow",
    "general_beastmaster_hide",
    "volcano_dragonscale_satchel"
   ],
   min: 50
  }
 },
 {
  code: "elite_few",
  cat: "조건부",
  cond: "인원 5명 이하 길드가 길드 랭킹 10위 이내인 동안",
  diff: "어려움"
 },
 {
  code: "david",
  cat: "대난투",
  cond: "전투력 서버 하위 50%로 대난투 3위 이내",
  diff: "어려움"
 },
 {
  code: "all_nighter",
  cat: "시간대",
  cond: "한 밤(0~6시)에 강화 수령 10회",
  diff: "중간"
 },
 {
  code: "flawless_all",
  cat: "조합",
  cond: "도전과제 전부 + 도감 완성 + 강화 +100 동시 보유",
  diff: "어려움"
 },
 {
  code: "longevity",
  cat: "일상",
  cond: "접속일 누적 500일",
  diff: "어려움"
 },
 {
  code: "paper_thin",
  cat: "대난투",
  cond: "대난투에서 뒤에서 2등",
  diff: "중간"
 },
 {
  code: "card_shark",
  cat: "강화",
  cond: "강화 대성공 5연속",
  diff: "어려움"
 },
 {
  code: "dawn_prayer",
  cat: "아이템 발동",
  cond: "해오름검 + 설야 예복 + 흔들리는 향로를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "celestial_dawn_greatsword",
    "temple_breathwoven_vestment",
    "temple_monk_censer"
   ],
   min: 50
  }
 },
 {
  code: "phoenix_set",
  cat: "아이템 발동",
  cond: "재에서 당기는 활 + 불새 깃 드레스 + 진홍 봉황선을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_phoenix_bow",
    "phoenix_dancer_dress",
    "kingdom_court_fan"
   ],
   min: 70
  }
 },
 {
  code: "abyss_lord",
  cat: "아이템 발동",
  cond: "혼불낫 + 도금이 벗겨진 갑주 + 작은 악마의 뿔을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "reaper_soul_scythe",
    "fallen_gilded_ruin_plate",
    "devil_horn_headband"
   ],
   min: 100
  }
 },
 {
  code: "silver_knight",
  cat: "아이템 발동",
  cond: "동트는 맹세 + 세라핌의 갑주 + 백은 날개 투구를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_dawnguard_sword",
    "angel_seraphguard_armor",
    "paladin_winged_helm"
   ],
   min: 50
  }
 },
 {
  code: "marsh_patrol",
  cat: "아이템 발동",
  cond: "피어나는 삼지창 + 개구리 탈 망토 + 반딧불 통발을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_lotus_trident",
    "marsh_frog_hood",
    "marsh_angler_creel"
   ],
   min: 30
  }
 },
 {
  code: "light_maiden",
  cat: "아이템 발동",
  cond: "유성의 지팡이 + 아침빛 예복 + 철사로 띄운 후광을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_star_wand",
    "angel_radiant_gown",
    "temple_faux_halo"
   ],
   min: 50
  }
 },
 {
  code: "warpath",
  cat: "아이템 발동",
  cond: "포효하는 용턱 + 흑룡의 비늘갑 + 용면 투구를 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_dragonjaw_halberd",
    "dragonknight_scale_armor",
    "dragonknight_horned_helm"
   ],
   min: 100
  }
 },
 {
  code: "ice_fishing",
  cat: "아이템 발동",
  cond: "봄을 겨눈 석궁 + 도롱이 + 반딧불 통발을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frostward_bow",
    "marsh_angler_cape",
    "marsh_angler_creel"
   ],
   min: 30
  }
 },
 {
  code: "festival_night",
  cat: "아이템 발동",
  cond: "춤추는 쌍불꽃 + 호박등 드레스 + 마녀의 뾰족 모자를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_dancer_daggers",
    "pumpkin_witch_dress",
    "pumpkin_witch_hat"
   ],
   min: 50
  }
 },
 {
  code: "night_walk",
  cat: "아이템 발동",
  cond: "흑금 대도 + 갈까마귀 로브 + 가려야 보이는 안대를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "general_kintsugi_katana",
    "necromancer_raven_robe",
    "general_star_eyepatch"
   ],
   min: 50
  }
 },
 {
  code: "glacier_knight",
  cat: "아이템 발동",
  cond: "눈꽃 대도 + 설산 파수의 갑주 + 빙정 방패를 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "temple_frost_odachi",
    "temple_frostguard_garb",
    "frost_kite_shield"
   ],
   min: 100
  }
 },
 {
  code: "hell_gatekeeper",
  cat: "아이템 발동",
  cond: "봉문검 + 도금이 벗겨진 갑주 + 용면 투구를 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "vault_key_greatsword",
    "fallen_gilded_ruin_plate",
    "dragonknight_horned_helm"
   ],
   min: 100
  }
 },
 {
  code: "steppe_wind",
  cat: "아이템 발동",
  cond: "돌아오는 뼈 + 모래바람의 겹옷 + 조상의 깃발을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_hunter_boomerang",
    "desert_nomad_robes",
    "orc_shaman_banner"
   ],
   min: 50
  }
 },
 {
  code: "court_mage",
  cat: "아이템 발동",
  cond: "유성의 지팡이 + 별을 읽는 외투 + 별이 박힌 왕관을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "angel_star_wand",
    "kingdom_riddle_coat",
    "kingdom_regalia_crown"
   ],
   min: 70
  }
 },
 {
  code: "ash_judge",
  cat: "아이템 발동",
  cond: "잿불낫 + 화문 예복 + 재가 흐르는 모래시계를 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_ember_scythe",
    "volcano_embersilk_dress",
    "volcano_ember_hourglass"
   ],
   min: 70
  }
 },
 {
  code: "treasure_hunt",
  cat: "조합",
  cond: "히든 칭호 10개 발견",
  diff: "어려움"
 },
 {
  code: "medal_collector",
  cat: "조합",
  cond: "칭호 50개 발견",
  diff: "어려움"
 },
 {
  code: "wandering_smith",
  cat: "일상",
  cond: "6개 지역 모두 거주해 봄",
  diff: "어려움"
 },
 {
  code: "uncrowned",
  cat: "조건부",
  cond: "랭킹 5종 모두 2~3위(1위는 없이)인 동안",
  diff: "어려움"
 },
 {
  code: "cbt_2026",
  cat: "헌정",
  cond: "CBT 참전(256명 한정 · 이후 획득 불가)",
  diff: "한정"
 },
 {
  code: "fire_and_ice",
  cat: "아이템 발동",
  cond: "용암을 가둔 대검 + 설산 파수의 갑주 + 빙정 방패를 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_emberveined_greatsword",
    "temple_frostguard_garb",
    "frost_kite_shield"
   ],
   min: 100
  }
 },
 {
  code: "heaven_knight",
  cat: "아이템 발동",
  cond: "창궁검 + 아침빛 예복 + 하얀 깃 날개를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "kingdom_winged_coronation_sword",
    "angel_radiant_gown",
    "angel_glide_wings"
   ],
   min: 50
  }
 },
 {
  code: "steam",
  cat: "아이템 발동",
  cond: "피어나는 삼지창 + 화문 예복 + 재가 흐르는 모래시계를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "swamp_lotus_trident",
    "volcano_embersilk_dress",
    "volcano_ember_hourglass"
   ],
   min: 50
  }
 },
 {
  code: "frozen_marsh",
  cat: "아이템 발동",
  cond: "눈꽃 대도 + 이끼 자란 넝마 드레스 + 수련 화관을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_frost_odachi",
    "swamp_bogwitch_rags",
    "swamp_lily_crown"
   ],
   min: 50
  }
 },
 {
  code: "savage_noble",
  cat: "아이템 발동",
  cond: "돌아오는 뼈 + 금장 군복 + 사자의 증표를 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "orc_hunter_boomerang",
    "royal_military_coat",
    "kingdom_coronation_medallion"
   ],
   min: 50
  }
 },
 {
  code: "foreign_god",
  cat: "아이템 발동",
  cond: "해오름검 + 깃털 두른 침묵 + 조상의 얼굴을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "celestial_dawn_greatsword",
    "orc_shaman_robe",
    "orc_ancestor_mask"
   ],
   min: 100
  }
 },
 {
  code: "dragon_crown",
  cat: "아이템 발동",
  cond: "포효하는 용턱 + 백금 사자 갑주 + 별이 박힌 왕관을 +100 이상으로 동시 장착 중인 동안",
  diff: "어려움",
  req: {
   items: [
    "volcano_dragonjaw_halberd",
    "kingdom_lionguard_plate",
    "kingdom_regalia_crown"
   ],
   min: 100
  }
 },
 {
  code: "winter_angel",
  cat: "아이템 발동",
  cond: "고드름이 자란 장궁 + 세라핌의 갑주 + 설화의 관을 +50 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "temple_icicle_longbow",
    "angel_seraphguard_armor",
    "temple_snowflake_crown"
   ],
   min: 50
  }
 },
 {
  code: "transfer_student",
  cat: "아이템 발동",
  cond: "퉤! 하는 대롱 + 왕립 학원 교복 + 반딧불 통발을 +30 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "marsh_frog_blowgun",
    "academy_student_uniform",
    "marsh_angler_creel"
   ],
   min: 30
  }
 },
 {
  code: "ash_angel",
  cat: "아이템 발동",
  cond: "재에서 당기는 활 + 사슬과 한쪽 날개 + 재를 막는 눈을 +70 이상으로 동시 장착 중인 동안",
  diff: "중간",
  req: {
   items: [
    "volcano_phoenix_bow",
    "angel_penitent_drape",
    "volcano_ashglass_goggles"
   ],
   min: 70
  }
 }
] as const;

export const TITLE_SECRET_BY_CODE: ReadonlyMap<string, TitleSecret> = new Map(TITLE_SECRETS.map((t) => [t.code, t]));
