/**
 * 도전 과제 정의 — 27종 + 전체 완료 보너스(2026-07-14 사용자 확정).
 * 게임의 모든 루프를 정확히 한 바퀴 돌게 만드는 일회성 온보딩 리워드.
 * 보상 합계: 과제 💎12,200 + 완료 보너스 💎5,000·상자 각 20 = 총 💎17,200.
 * 상점 무료 3종은 CBT(결제 숨김) 동안 자동 숨김 — 정식 오픈 시 자동 등장(activeChallenges).
 * 달성 판정 SQL은 status.ts(상태 파생), 예외 4종은 challenge_events 마킹.
 */
export type ChallengeGroup =
  | 'supply' | 'equip' | 'enhance' | 'daily' | 'growth' | 'app' | 'social' | 'guild' | 'raid' | 'world' | 'avatar' | 'shop';

export type ChallengeDef = {
  id: string;
  group: ChallengeGroup;
  label: string;
  diamond: number;
  /** 미달성 시 '하러 가기' 링크. */
  go: string;
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
  { id: 'world', icon: '🗺️', label: '월드' },
  { id: 'avatar', icon: '✨', label: '아바타' },
  { id: 'shop', icon: '🎁', label: '상점' },
];

export const CHALLENGES: ChallengeDef[] = [
  { id: 'supply_weapon', group: 'supply', label: '무기 상자 열기', diamond: 200, go: '/gacha' },
  { id: 'supply_armor', group: 'supply', label: '방어구 상자 열기', diamond: 200, go: '/gacha' },
  { id: 'supply_accessory', group: 'supply', label: '장신구 상자 열기', diamond: 200, go: '/gacha' },
  { id: 'equip_weapon', group: 'equip', label: '무기 장착하기', diamond: 200, go: '/inventory' },
  { id: 'equip_armor', group: 'equip', label: '방어구 장착하기', diamond: 200, go: '/inventory' },
  { id: 'equip_accessory', group: 'equip', label: '장신구 장착하기', diamond: 200, go: '/inventory' },
  { id: 'enhance_weapon', group: 'enhance', label: '무기 강화하기', diamond: 200, go: '/enhance' },
  { id: 'enhance_armor', group: 'enhance', label: '방어구 강화하기', diamond: 200, go: '/enhance' },
  { id: 'enhance_accessory', group: 'enhance', label: '장신구 강화하기', diamond: 200, go: '/enhance' },
  { id: 'mail_claim', group: 'daily', label: '우편 보상 받기', diamond: 200, go: '/mail' },
  { id: 'checkin', group: 'daily', label: '출석 체크하기', diamond: 200, go: '/checkin' },
  { id: 'transcend', group: 'growth', label: '장비 초월 달성하기', diamond: 300, go: '/gacha' },
  { id: 'gem_reduce', group: 'growth', label: '보석으로 강화 시간 줄이기', diamond: 200, go: '/enhance' },
  { id: 'app_install', group: 'app', label: '앱으로 실행하기', diamond: 1000, go: '/me/settings' },
  { id: 'push_on', group: 'app', label: '알림 설정하기', diamond: 2000, go: '/me/settings' },
  { id: 'friend', group: 'social', label: '친구 맺기', diamond: 300, go: '/friends' },
  { id: 'boast_share', group: 'social', label: '내 프로필 자랑하기', diamond: 300, go: '/me' },
  { id: 'guild_join', group: 'guild', label: '길드 가입하기', diamond: 500, go: '/guild' },
  { id: 'guild_donate', group: 'guild', label: '길드에 기부하기', diamond: 500, go: '/guild' },
  { id: 'guild_deploy', group: 'guild', label: '점령전 병력 배치하기', diamond: 500, go: '/guild/deploy' },
  { id: 'raid_summon', group: 'raid', label: '레이드 소환하기', diamond: 300, go: '/raid' },
  { id: 'raid_attack', group: 'raid', label: '레이드 공격하기', diamond: 300, go: '/raid' },
  { id: 'raid_reward', group: 'raid', label: '레이드 보상 받기', diamond: 500, go: '/raid' },
  { id: 'melee_join', group: 'social', label: '대난투 참가하기', diamond: 500, go: '/melee' },
  { id: 'residence_move', group: 'world', label: '거주 구역 이동하기', diamond: 300, go: '/guild/map' },
  { id: 'avatar_change', group: 'avatar', label: '아바타 변경하기', diamond: 500, go: '/me/profiles' },
  { id: 'avatar_create', group: 'avatar', label: '나만의 아바타 만들기', diamond: 1000, go: '/me/profiles' },
  { id: 'shop_daily', group: 'shop', label: '일일 무료 선물 받기', diamond: 200, go: '/shop' },
  { id: 'shop_weekly', group: 'shop', label: '주간 무료 선물 받기', diamond: 300, go: '/shop?tab=weekly' },
  { id: 'shop_monthly', group: 'shop', label: '월간 무료 선물 받기', diamond: 500, go: '/shop?tab=monthly' },
];

/**
 * 현재 노출·달성 대상 과제 — CBT(결제 숨김 = 상점 전체 '준비 중') 동안 shop 그룹 제외.
 * 컴플리트 보너스 판정도 이 목록 기준(숨긴 과제가 완주를 막지 않게).
 */
export function activeChallenges(hidePaid: boolean): ChallengeDef[] {
  return hidePaid ? CHALLENGES.filter((c) => c.group !== 'shop') : CHALLENGES;
}

/** 전체 완료 보너스 — 27종 전부 수령 시. */
export const COMPLETE_BONUS = {
  id: 'complete',
  label: '모든 도전 과제 완료!',
  diamond: 5000,
  boxes: { weapon: 20, armor: 20, accessory: 20 },
} as const;

export const CHALLENGE_IDS = new Set(CHALLENGES.map((c) => c.id));

/** challenge_events로 마킹되는 이벤트형 과제(상태 흔적이 없는 행위). */
export const EVENT_CHALLENGES = new Set(['app_install', 'boast_share', 'residence_move', 'avatar_change']);
