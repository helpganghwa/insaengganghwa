/**
 * 도전 과제 정의 — 28종 + 전체 완료 보너스(2026-07-14 사용자 확정, 07-21 채팅 추가).
 * 게임의 모든 루프를 정확히 한 바퀴 돌게 만드는 일회성 온보딩 리워드.
 * 보상 합계: 과제 💎12,700+📦75 + 완료 보너스 💎5,000+📦150 = 총 💎17,700·📦225.
 * 📦는 루프 시동 길목·고가치 행동 4종에만(초월·앱·알림·아바타 생성) — 완료 보너스 임팩트 보존.
 * 상점 무료 3종은 CBT(결제 숨김) 동안 자동 숨김 — 정식 오픈 시 자동 등장(activeChallenges).
 * 달성 판정 SQL은 status.ts(상태 파생), 예외 5종은 challenge_events 마킹.
 */
export type ChallengeGroup =
  | 'supply' | 'equip' | 'enhance' | 'daily' | 'growth' | 'app' | 'social' | 'guild' | 'raid' | 'world' | 'avatar' | 'shop';

export type ChallengeDef = {
  id: string;
  group: ChallengeGroup;
  label: string;
  diamond: number;
  /** 바로가기 링크(가이드 팝업 하단 버튼). */
  go: string;
  /** 달성 방법 안내(가이드 팝업 본문). */
  guide: string;
  /** 보급상자 추가 보상(총 개수, 3의 배수 — 3슬롯 균등 분배). 대부분 과제는 💎만. */
  boxes?: number;
};

export const CHALLENGE_GROUPS: { id: ChallengeGroup; icon: string; label: string }[] = [
  { id: 'supply', icon: '📦', label: '보급' },
  { id: 'equip', icon: '🎒', label: '장착' },
  { id: 'enhance', icon: '⚒️', label: '강화' },
  { id: 'daily', icon: '📅', label: '일상' },
  { id: 'growth', icon: '✦', label: '성장' },
  { id: 'app', icon: '📱', label: '앱' },
  { id: 'social', icon: '👥', label: '소셜' },
  { id: 'guild', icon: '🏰', label: '길드' },
  { id: 'raid', icon: '⚔️', label: '레이드' },
  { id: 'world', icon: '🗺️', label: '세계지도' },
  { id: 'avatar', icon: '✨', label: '아바타' },
  { id: 'shop', icon: '🎁', label: '상점' },
];

export const CHALLENGES: ChallengeDef[] = [
  { id: 'supply_weapon', group: 'supply', label: '무기 상자 열기', diamond: 200, go: '/gacha', guide: '보급에서 무기 상자를 1회 열면 달성돼요. 상자가 없다면 우편함·출석 보상을 확인해 보세요.' },
  { id: 'supply_armor', group: 'supply', label: '방어구 상자 열기', diamond: 200, go: '/gacha', guide: '보급에서 방어구 상자를 1회 열면 달성돼요. 상자가 없다면 우편함·출석 보상을 확인해 보세요.' },
  { id: 'supply_accessory', group: 'supply', label: '장신구 상자 열기', diamond: 200, go: '/gacha', guide: '보급에서 장신구 상자를 1회 열면 달성돼요. 상자가 없다면 우편함·출석 보상을 확인해 보세요.' },
  { id: 'equip_weapon', group: 'equip', label: '무기 장착하기', diamond: 200, go: '/inventory', guide: '인벤토리에서 무기를 선택해 장착하면 달성돼요.' },
  { id: 'equip_armor', group: 'equip', label: '방어구 장착하기', diamond: 200, go: '/inventory', guide: '인벤토리에서 방어구를 선택해 장착하면 달성돼요.' },
  { id: 'equip_accessory', group: 'equip', label: '장신구 장착하기', diamond: 200, go: '/inventory', guide: '인벤토리에서 장신구를 선택해 장착하면 달성돼요.' },
  { id: 'enhance_weapon', group: 'enhance', label: '무기 강화하기', diamond: 200, go: '/enhance', guide: '강화소의 무기 슬롯에 장비를 올려 강화를 시작하면 달성돼요.' },
  { id: 'enhance_armor', group: 'enhance', label: '방어구 강화하기', diamond: 200, go: '/enhance', guide: '강화소의 방어구 슬롯에 장비를 올려 강화를 시작하면 달성돼요.' },
  { id: 'enhance_accessory', group: 'enhance', label: '장신구 강화하기', diamond: 200, go: '/enhance', guide: '강화소의 장신구 슬롯에 장비를 올려 강화를 시작하면 달성돼요.' },
  { id: 'mail_claim', group: 'daily', label: '우편 보상 받기', diamond: 200, go: '/mail', guide: '우편함에서 우편을 수령하면 달성돼요. 어떤 우편이든 좋아요!' },
  { id: 'checkin', group: 'daily', label: '출석 체크하기', diamond: 200, go: '/checkin', guide: '출석 캘린더에서 오늘의 보상을 받으면 달성돼요.' },
  { id: 'transcend', group: 'growth', label: '장비 초월 달성하기', diamond: 300, boxes: 15, go: '/gacha', guide: '같은 장비를 중복으로 모으면 자동으로 초월돼요 — 보급상자를 열다 보면 자연히 달성됩니다!' },
  { id: 'gem_reduce', group: 'growth', label: '다이아로 강화 시간 줄이기', diamond: 200, go: '/enhance', guide: '진행 중인 강화 카드에서 다이아로 남은 시간을 단축하면 달성돼요.' },
  { id: 'app_install', group: 'app', label: '앱으로 실행하기', diamond: 1000, boxes: 15, go: '/me/settings', guide: '홈 화면에 앱으로 설치한 뒤, 설치된 앱으로 접속하면 달성돼요. 아래 버튼으로 설치를 시작하세요.' },
  { id: 'push_on', group: 'app', label: '알림 설정하기', diamond: 2000, boxes: 30, go: '/me/settings', guide: '설정 → 알림에서 알림을 켜면 달성돼요. 강화 완료·레이드 소식을 놓치지 않게 됩니다.' },
  { id: 'friend', group: 'social', label: '친구 맺기', diamond: 300, go: '/friends', guide: '친구 화면에서 닉네임이나 코드(#)로 검색해 친구를 맺으면 달성돼요.' },
  { id: 'boast_share', group: 'social', label: '내 프로필 자랑하기', diamond: 300, go: '/me', guide: '프로필의 \'내 프로필 자랑하기\'로 카카오톡 공유를 실행하면 달성돼요.' },
  { id: 'chat_send', group: 'social', label: '채팅 메시지 보내기', diamond: 500, go: '/?chat=all', guide: '화면 아래 채팅바를 열고 전체 채팅에 메시지를 보내면 달성돼요. 가볍게 인사를 남겨보세요!' },
  { id: 'guild_join', group: 'guild', label: '길드 가입하기', diamond: 500, go: '/guild', guide: '길드 탭에서 마음에 드는 길드에 가입하면 달성돼요.' },
  { id: 'guild_donate', group: 'guild', label: '길드에 기부하기', diamond: 500, go: '/guild', guide: '길드 홈에서 기부하면 달성돼요 — 하루 3회, 첫 회는 무료!' },
  { id: 'guild_deploy', group: 'guild', label: '점령전 배치', diamond: 500, go: '/guild/deploy', guide: '길드 → 점령전 배치에서 구역에 공격 또는 수비를 등록하면 달성돼요.' },
  { id: 'raid_summon', group: 'raid', label: '레이드 소환하기', diamond: 300, go: '/raid', guide: '레이드에서 보스를 소환하면 달성돼요.' },
  { id: 'raid_attack', group: 'raid', label: '레이드 공격하기', diamond: 300, go: '/raid', guide: '진행 중인 레이드에 들어가 공격하면 달성돼요 — 친구·길드 레이드 참여도 인정!' },
  { id: 'raid_reward', group: 'raid', label: '레이드 보상 받기', diamond: 500, go: '/raid', guide: '레이드 종료 후 정산 보상을 수령하면 달성돼요.' },
  { id: 'melee_join', group: 'social', label: '대난투 참가하기', diamond: 500, go: '/melee', guide: '매일 아침 9시, 전투력이 있는 모든 모험가가 자동으로 참가해요. 9시가 지나 시작했다면 내일 아침 대난투부터 참가됩니다!' },
  { id: 'residence_move', group: 'world', label: '거주 구역 이동하기', diamond: 300, go: '/guild/map', guide: '세계지도에서 다른 구역을 선택해 거주지를 이동하면 달성돼요.' },
  { id: 'avatar_change', group: 'avatar', label: '아바타 변경하기', diamond: 500, go: '/me/profiles', guide: '아바타 관리에서 다른 아바타를 대표로 지정하면 달성돼요.' },
  { id: 'avatar_create', group: 'avatar', label: '나만의 아바타 만들기', diamond: 1000, boxes: 15, go: '/me/profiles', guide: '아바타 관리에서 나만의 아바타를 생성하면 달성돼요 — 지금 착용한 장비가 반영됩니다!' },
  { id: 'shop_daily', group: 'shop', label: '일일 무료 선물 받기', diamond: 200, go: '/shop', guide: '상점 일일 탭에서 무료 선물을 받으면 달성돼요.' },
  { id: 'shop_weekly', group: 'shop', label: '주간 무료 선물 받기', diamond: 300, go: '/shop?tab=weekly', guide: '상점 주간 탭에서 무료 선물을 받으면 달성돼요.' },
  { id: 'shop_monthly', group: 'shop', label: '월간 무료 선물 받기', diamond: 500, go: '/shop?tab=monthly', guide: '상점 월간 탭에서 무료 선물을 받으면 달성돼요.' },
];

/**
 * 현재 노출·달성 대상 과제 — CBT(결제 숨김 = 상점 전체 '준비 중') 동안 shop 그룹 제외.
 * 컴플리트 보너스 판정도 이 목록 기준(숨긴 과제가 완주를 막지 않게).
 */
export function activeChallenges(hidePaid: boolean): ChallengeDef[] {
  return hidePaid ? CHALLENGES.filter((c) => c.group !== 'shop') : CHALLENGES;
}

/** 전체 완료 보너스 — 전 과제 수령 시. */
export const COMPLETE_BONUS = {
  id: 'complete',
  label: '모든 도전 과제 완료!',
  diamond: 5000,
  boxes: { weapon: 50, armor: 50, accessory: 50 },
} as const;

export const CHALLENGE_IDS = new Set(CHALLENGES.map((c) => c.id));

/** challenge_events로 마킹되는 이벤트형 과제(상태 흔적이 없는 행위). */
export const EVENT_CHALLENGES = new Set(['app_install', 'boast_share', 'residence_move', 'avatar_change', 'chat_send']);
