/**
 * 길드 밸런스 상수 — GUILD.md §1~§5 수치의 단일 출처(CLAUDE §3.5). 시작 테스트값, 시뮬 튜닝 대상.
 * 모든 게임 결정(비용 차감·XP·세금·전투 보너스)은 이 상수만 사용한다(하드코딩 금지).
 */

// ── 결성 / 정체성 (§1, §1.6) ──
/** 길드 결성 비용(💎). 빈 길드 양산 억제 + 다이아 sink. */
export const GUILD_CREATE_COST_DIAMOND = 10_000;
/** 문양 재생성 비용(💎). 결성 시 1회 무료, 이후 재생성 과금(외형 BM). */
export const GUILD_EMBLEM_REROLL_COST_DIAMOND = 5_000;
export const GUILD_NAME_MIN_LEN = 2;
export const GUILD_NAME_MAX_LEN = 10;
export const GUILD_NOTICE_MAX_LEN = 60;
/** 가입 방식 — open(자유: 즉시 가입) | approval(승인: 길드장/부길드장 승인). */
export type GuildJoinPolicy = 'open' | 'approval';

// ── 수용 / 레벨 (§2.3) ──
/** 수용 인원 = min(50, 10 + level). L0=10명 … L40=50명(상한). */
export const GUILD_BASE_CAPACITY = 10;
export const GUILD_MAX_CAPACITY = 50;
export function guildCapacity(level: number): number {
  return Math.min(GUILD_MAX_CAPACITY, GUILD_BASE_CAPACITY + Math.max(0, level));
}
/** 수용 상한 도달 레벨(이후 레벨은 무제한·과시·혜택 0). */
export const GUILD_CAPACITY_MAX_LEVEL = 40;
/** 다음 레벨까지 필요 XP — 앞 싸게/뒤 비싸게(L0~9 400 · L10~24 1.5k · L25+ 5k). */
export function guildXpToNext(level: number): number {
  if (level < 10) return 400;
  if (level < 25) return 1_500;
  return 5_000;
}

// ── 기부 (§2.1) — 일 3회, KST 자정 리셋. 개인 기여도 = 길드 XP와 1:1 ──
export const GUILD_DONATIONS_PER_DAY = 3;
/** index 0=1회차(무료) … 2=3회차. cost=💎, xp=길드 XP(=개인 기여도). */
export const GUILD_DONATION_TIERS = [
  { cost: 0, xp: 10 },
  { cost: 50, xp: 30 },
  { cost: 100, xp: 70 },
] as const;

// ── 직책 / 운영 (§1, §4) ──
/** 부길드장 임명 상한(길드당). */
export const GUILD_MAX_VICE = 5;
/** 길드장 미접속 자동 위임(일). 경고 알림은 WARN_DAYS차. */
export const GUILD_LEADER_HANDOVER_DAYS = 7;
export const GUILD_LEADER_HANDOVER_WARN_DAYS = 5;
/** 탈퇴 후 재가입 잠금(시간). */
export const GUILD_REJOIN_LOCK_HOURS = 24;

// ── 점령전 (§5.4) ──
/** 일일 전투 시각(KST 시). 11:00 배치 잠금 → 결정론 정산(전투창 11:00~12:00). */
export const CONQUEST_BATTLE_KST_HOUR = 11;
/** 일반 방어 인원 전투력 보너스(+20%). */
export const CONQUEST_DEFENDER_BONUS = 0.2;
/** 집행관 전투력 배수(×3, 방어 거점 앵커). */
export const CONQUEST_EXECUTOR_POWER_MULT = 3;
export const ZONE_TOTAL = 50;

/** 배치 역할 — 공격/수비. 집행관은 배치행 없이 자동 수비(별도). */
export type ConquestRole = 'attack' | 'defend';
/**
 * 유효 전투력 배수(§5.8②) — 보정은 effCP에 적용(HP·데미지 둘 다). 시뮬 튜닝값.
 *  공격 ×1.0 · 수비 ×1.2 · 집행관 ×3.0(집행관은 자동 수비, isExecutor로 구분).
 */
export function conquestPowerMult(role: ConquestRole, isExecutor: boolean): number {
  if (isExecutor) return CONQUEST_EXECUTOR_POWER_MULT;
  return role === 'defend' ? 1 + CONQUEST_DEFENDER_BONUS : 1;
}
/** HP = effCP × 배수(대난투 정합). */
export const CONQUEST_HP_MULT = 2;
/** 데미지 = 공격자 effCP × U(MIN,MAX)(최소 1). */
export const CONQUEST_DMG_MIN = 0.5;
export const CONQUEST_DMG_MAX = 1.2;
/** 리플레이 보존 라운드(링버퍼, 클라이맥스 마지막 N). */
export const CONQUEST_REPLAY_ROUNDS = 1000;

// ── 세금 (§5.5) — 포인트 누적 → 100pt마다 구역 💎 +1 → 집행관 수금(10%/90%) ──
/** 거주 구역 강화 성공 시 누적되는 포인트 = 도달 강화 레벨(예 +99 성공 → 99pt). */
export function taxPointsForEnhanceSuccess(reachedLevel: number): number {
  return Math.max(0, reachedLevel);
}
/** 구역 포인트 → 💎 환산비(100pt = 1💎). 잔여 포인트는 carry. 시뮬 튜닝(과하면 상향). */
export const TAX_POINTS_PER_DIAMOND = 100;
/** 집행관 수금 시 집행관 몫 비율(10%). 나머지 90%는 길드 풀로. */
export const GUILD_EXECUTOR_TAX_CUT = 0.1;
/** 집행관 세금 수금 쿨다운(분). */
export const TAX_COLLECT_COOLDOWN_MIN = 60;
/** 분배 방식. */
export type GuildTaxDistribution = 'equal' | 'target';
