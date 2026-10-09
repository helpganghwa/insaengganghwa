/**
 * 길드 밸런스 상수 — GUILD.md §1~§5 수치의 단일 출처(CLAUDE §3.5). 시작 테스트값, 시뮬 튜닝 대상.
 * 모든 게임 결정(비용 차감·XP·세금·전투 보너스)은 이 상수만 사용한다(하드코딩 금지).
 */

// ── 결성 / 정체성 (§1, §1.6) ──
/**
 * 길드 결성 비용(💎). 빈 길드 양산 억제 + 다이아 sink.
 * 2026-08-10 유입 리밸런싱(930→454💎/일)에 맞춰 5,000→3,000 — 점령전 전체가 길드 수에
 * 종속되는데 실비도 반복 구매도 없어, 내려서 잃을 것이 없는 항목이다.
 */
export const GUILD_CREATE_COST_DIAMOND = 3_000;
/**
 * 문양 생성 비용(💎). 결성 시 1회 무료, 이후 새 문양 생성마다 과금(외형 BM).
 * 3,000→1,500(같은 리밸런싱). ⚠ 아바타 생성과 함께 외부 유료 API를 호출하는 지출처 —
 * 실비(~$0.02)보다 동시 생성 슬롯 소모가 병목이다.
 */
export const GUILD_EMBLEM_REROLL_COST_DIAMOND = 1_500;
/** 길드당 보관 가능한 문양 최대 수(최소 1). 아바타 다중 프로필 패턴. */
export const MAX_GUILD_EMBLEMS = 5;
export const GUILD_NAME_MIN_LEN = 2;
export const GUILD_NAME_MAX_LEN = 8;
export const GUILD_NOTICE_MAX_LEN = 200;
/** 길드 소개(공개, 목록 팝업 노출) 최대 길이. */
export const GUILD_INTRO_MAX_LEN = 160; // 유저 건의(플레이스토어 오픈 전 "뭐 하는 길드인지" 보여주기엔 부족) — 60→120(2026-09-16)→160(09-20)
/** 가입 방식 — open(자유: 즉시 가입) | approval(승인: 길드장/부길드장 승인). */
export type GuildJoinPolicy = 'open' | 'approval';

// ── 수용 / 레벨 (§2.3) ──
/** 수용 인원 = min(50, 10 + level). L0=10명 … L40=50명(상한). */
export const GUILD_BASE_CAPACITY = 10;
export const GUILD_MAX_CAPACITY = 50;
export function guildCapacity(level: number): number {
  return Math.min(GUILD_MAX_CAPACITY, GUILD_BASE_CAPACITY + Math.max(0, level));
}
/**
 * 다음 레벨까지 필요 XP — 등차 곡선 110×(level+1). 레벨마다 +110씩 체증(엄격 증가)해
 * 갈수록 어려워진다. L0→1=110 … L39→40=4,400, L40 도달 누적 90,200 XP.
 * 정원(=하루 최대 XP=90×min(50,10+L))도 함께 커지지만 XP가 더 빨리 증가해
 * 레벨당 소요 시간도 계속 늘어남(0.12일→1.0일). 이론상 최속(항상 정원 만석·전원 일 90 기부)
 * L40까지 ≈30.7일 ≈ 한 달. L41+는 상한(정원50) 도달 후에도 곡선 유지 → 과시·랭킹용 영구 sink.
 * GUILD.md §2.2와 1:1(CLAUDE §3.5). 시뮬 튜닝 시 계수 110만 조정.
 */
export const GUILD_XP_PER_LEVEL_STEP = 110;
export function guildXpToNext(level: number): number {
  return GUILD_XP_PER_LEVEL_STEP * (Math.max(0, level) + 1);
}

// ── 기부 (§2.1) — 일 3회, KST 자정 리셋. 개인 기여도 = 길드 XP와 1:1 ──
export const GUILD_DONATIONS_PER_DAY = 3;
/** index 0=1회차(무료) … 2=3회차. cost=💎, xp=길드 XP(=개인 기여도). */
// 단계별 비용은 0/50/100💎로 증가하되, 기여도·길드 경험치 보상은 단계 무관 30 고정.
export const GUILD_DONATION_TIERS = [
  { cost: 0, xp: 30 },
  { cost: 50, xp: 30 },
  { cost: 100, xp: 30 },
] as const;

// ── 직책 / 운영 (§1, §4) ──
/** 부길드장 임명 상한(길드당). */
export const GUILD_MAX_VICE = 5;
/** 길드장 미접속 자동 위임(일). 경고 알림은 WARN_DAYS차. */
export const GUILD_LEADER_HANDOVER_DAYS = 7;
export const GUILD_LEADER_HANDOVER_WARN_DAYS = 5;
/** 탈퇴 후 재가입 잠금(시간). CBT 동안 1시간으로 완화했다가 2026-07-30 원래 값 24로 복원
 *  (길드 안정성 — 점령전 직전 이적으로 판을 흔드는 것을 막는다). */
export const GUILD_REJOIN_LOCK_HOURS = 24;
/** 길드명 변경(2026-08-31) — 결성 후 첫 변경까지 대기일 / 변경 후 다음 변경까지 대기일. 잦은 개명이 역사 기록을 흐리지 않게. */
export const GUILD_RENAME_AFTER_DAYS = 7;
export const GUILD_RENAME_COOLDOWN_DAYS = 30;
/** 가입 신청이 거절된 뒤 같은 길드에 다시 신청할 수 있을 때까지의 대기 시간(문의 #148, 신청 스팸 차단). */
export const GUILD_REAPPLY_COOLDOWN_HOURS = 24;

/** 가입 신청 유효기간(일) — 지나면 목록에서 사라진다. 방치된 신청이 영구 대기하지 않게. */
export const GUILD_JOIN_REQUEST_TTL_DAYS = 7;

// ── 점령전 (§5.4) ──
/** 일일 전투 시각(KST 시). 23:00 배치 잠금·정산 → 자정(00:00) 연대기(전투창 23:00~24:00). */
export const CONQUEST_BATTLE_KST_HOUR = 23;
/** 일반 방어 인원 전투력 보너스(+20% = ×1.2). */
export const CONQUEST_DEFENDER_BONUS = 0.2;
/** 집행관 전투력 배수(×1.5, 방어 거점 앵커). 고착 개선(B안) — 기존 ×2에서 축소. */
export const CONQUEST_EXECUTOR_POWER_MULT = 1.5;

/** 배치 역할 — 공격/수비. 집행관은 배치행 없이 자동 수비(별도). */
export type ConquestRole = 'attack' | 'defend';
/**
 * 유효 전투력 배수(§5.8②) — 보정은 effCP에 적용(HP·데미지 둘 다). 시뮬 튜닝값.
 *  공격 ×1.0 · 수비 ×1.2 · 집행관 ×CONQUEST_EXECUTOR_POWER_MULT(B안 1.5, 자동 수비·isExecutor로 구분).
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

// ── 거주 이동 (§5.5) ──
// 배치·집행관은 그 구역 거주자만 가능하고, 거주 이동은 어느 구역으로든 즉시 가능하다.
// 이동 쿨타임(6시간·보석 단축)은 2026-08-31, 인접 제한은 2026-09-23 삭제 — 둘 다 점령전 참여를 막는
// 마찰이었고, 세력의 연속성은 공격 인접 규칙(assertAttackable)이 지킨다.

// ── 세금 (§5.5) — 포인트 누적 → 100pt마다 구역 💎 +1 → 집행관 수금(10%/90%) ──
/** 거주 구역 강화 성공 시 누적되는 포인트 = 도달 강화 레벨(예 +99 성공 → 99pt). */
export function taxPointsForEnhanceSuccess(reachedLevel: number): number {
  return Math.max(0, reachedLevel);
}
/** 구역 포인트 → 💎 환산비(100pt = 1💎). 잔여 포인트는 carry. 시뮬 튜닝(과하면 상향). */
export const TAX_POINTS_PER_DIAMOND = 100;
/** 거주 구역 다이아 지출 세금 — 지출 1💎당 포인트(1pt = 지출의 1%). 지갑 차감 전부가 대상(결제·환불은 지출이 아님). 상한 없음. */
export const TAX_POINTS_PER_DIAMOND_SPENT = 1;
export function taxPointsForSpend(diamondsSpent: number): number {
  return Math.max(0, Math.floor(diamondsSpent)) * TAX_POINTS_PER_DIAMOND_SPENT;
}
/** 대난투 상금 세금 — 참가자 상금(💎)의 10%가 거주 구역에 적립된다(유저가 받는 상금은 그대로). */
export const TAX_MELEE_PRIZE_RATE = 0.1;
export function taxPointsForMeleePrize(prizeDiamonds: number): number {
  return Math.round(Math.max(0, prizeDiamonds) * TAX_MELEE_PRIZE_RATE * TAX_POINTS_PER_DIAMOND);
}
/** 집행관 수금 시 집행관 몫 비율(10%). 나머지 90%는 길드 풀로. */
export const GUILD_EXECUTOR_TAX_CUT = 0.1;
/**
 * 집행관 세금 수금 쿨다운(분) — 2일(48시간). 2026-09-18 유저 투표 결과로 72h → 48h(소규모 업데이트 8).
 * 세금 적립량은 수금 주기와 무관해 다이아 유입 총량은 그대로다.
 *
 * 전환 규칙(사용자 결정 2026-09-18: 이미 도는 쿨다운으로 점령전을 계획한 길드 보호) — **쿨다운이 시작된 시각**
 * (습득 captured_at 또는 직전 수금 last_tax_collected_at)이 48h 적용 시작 전이면 그 쿨다운은 끝까지 72h,
 * 이후에 시작된 쿨다운부터 48h. 적용 시작 시각은 서버가 환경별로 정해(tax-cooldown.ts) 화면에 내려준다.
 */
export const TAX_COLLECT_COOLDOWN_MIN = 48 * 60;
/** 48h 전환 전에 시작된 쿨다운의 길이(분) — 이전 규칙 72시간. */
export const TAX_COLLECT_COOLDOWN_LEGACY_MIN = 72 * 60;

/** 쿨다운 길이(ms) — 그 쿨다운이 시작된 시각과 48h 적용 시작 시각으로. 서버·화면 공용 순수 함수. */
export function taxCooldownMsFor(startMs: number, since48Ms: number): number {
  return (startMs >= since48Ms ? TAX_COLLECT_COOLDOWN_MIN : TAX_COLLECT_COOLDOWN_LEGACY_MIN) * 60_000;
}

/**
 * 수금 가능 시각(ms) — 습득 쿨다운과 직전 수금 쿨다운을 **각자의 길이로** 끝낸 뒤 늦은 쪽(서버 게이트와 같은 판정).
 * 둘 다 없으면 null(게이트 없음 = 즉시 가능).
 */
export function taxReadyAtMs(capturedMs: number | null, lastMs: number | null, since48Ms: number): number | null {
  const ends: number[] = [];
  if (capturedMs != null) ends.push(capturedMs + taxCooldownMsFor(capturedMs, since48Ms));
  if (lastMs != null) ends.push(lastMs + taxCooldownMsFor(lastMs, since48Ms));
  return ends.length > 0 ? Math.max(...ends) : null;
}
/** 독점 세금 보너스(B안) — 소유 구역 1개당 +1%, 완전장악 권역 1개당 +25%. 그 길드 세금 전체에 적용(누적 시점).
 *  예) 왕국6(완전장악)+오크1 = 7구역 → 7% + 25% = +32%. */
export const GUILD_ZONE_TAX_BONUS = 0.01;
export const GUILD_FULL_REGION_TAX_BONUS = 0.25;
/** 분배 방식. */
export type GuildTaxDistribution = 'equal' | 'target';

// ── 월드보스 (docs/WORLD-BOSS.md) ──
// 수치는 자리 표시(사용자 결정: 구현 뒤 스테이징에서 조정). 구조·규칙은 확정.
/** 출현 시각 창(KST 시, [from, to)) — 그날 0시에 이 창 안의 분 단위 시각을 추첨한다. */
export const WORLD_BOSS_SPAWN_KST_HOURS = { from: 9, to: 21 } as const;
/** 머무는 시간(ms) — 자정 공개를 두 번 지나 주인이 바뀔 기회가 두 번. */
export const WORLD_BOSS_STAY_MS = 48 * 60 * 60 * 1000;
/** 떠난 뒤 구역 시트에 기록 한 줄을 남기는 시간(ms) — 머무는 시간과 같은 48시간(사용자 확정 10-07). */
export const WORLD_BOSS_LEFT_NOTE_MS = 48 * 60 * 60 * 1000;
/** 원정대 최대 인원(대장 포함). 최소 인원 제한 없음. */
export const WORLD_BOSS_PARTY_MAX = 10;
/**
 * 단계 체력(서버 공통 — 누구 땅이든 같다). 단계 k(1부터)를 넘기는 데 BASE × GROWTH^(k-1) 피해.
 * 단계는 끝이 없고, 전리품은 WORLD_BOSS_LOOT_STAGE_CAP단계까지만 쌓인다.
 */
// 실서버 시뮬로 확정(장착 3개 + 아바타 + 약점 기준, Winners 20.4·로제 17.7·Phoenix 14.6단계 — docs/WORLD-BOSS.md §3).
export const WORLD_BOSS_STAGE_BASE_HP = 650_000;
export const WORLD_BOSS_STAGE_GROWTH = 1.1;
/** 단계마다 쌓이는 길드 전리품 — 떠날 때 그 구역 주인 길드 금고로(집행관 몫 없음). 상자는 3의 배수. */
export const WORLD_BOSS_LOOT_PER_STAGE = { diamond: 150, boxes: 12 } as const; // 2026-10-08 확정(L1)
export const WORLD_BOSS_LOOT_STAGE_CAP = 30;
/** 단계마다 떠날 때 주인 길드가 받는 길드 경험치. */
export const WORLD_BOSS_GUILD_XP_PER_STAGE = 20;
/**
 * 공격마다 뽑는 보상(복권, 2026-10-08 사용자 확정) — 원정대원이 공격할 때마다 이 표에서 **하나만** 나온다(다이아 또는 상자 또는 꽝).
 * 피해량과 무관. 확률은 십만분율(합 100,000). 상자는 부위 3종 균등이라 3의 배수. 확률표는 화면에 표시하지 않는다(사용자 결정).
 * 기대값(공격 1회) 💎9.25 📦1.89 — 실서버 시뮬 1인 평균 5.25회 공격 기준 보스 하나에 💎49 📦10.
 */
export const WORLD_BOSS_ATTACK_DROPS: readonly { diamond: number; boxes: number; p: number }[] = [
  { diamond: 0, boxes: 0, p: 50_000 }, // 꽝 50%
  { diamond: 5, boxes: 0, p: 16_000 },
  { diamond: 20, boxes: 0, p: 9_000 },
  { diamond: 50, boxes: 0, p: 4_500 },
  { diamond: 100, boxes: 0, p: 2_000 },
  { diamond: 300, boxes: 0, p: 600 },
  { diamond: 1000, boxes: 0, p: 60 }, // 0.06%
  { diamond: 0, boxes: 3, p: 11_000 },
  { diamond: 0, boxes: 9, p: 4_500 },
  { diamond: 0, boxes: 30, p: 1_800 },
  { diamond: 0, boxes: 90, p: 480 },
  { diamond: 0, boxes: 300, p: 60 }, // 0.06%
];
export const WORLD_BOSS_ATTACK_DROP_TOTAL = 100_000;

/** [0,1) 난수 하나 → 공격 1회 보상(lucky = 약점 2개 이상 적중). 서버 시드 RNG에서만 부른다(CLAUDE §3.1). */
export function worldBossRollDrop(r: number, lucky = false): { diamond: number; boxes: number } {
  let x = Math.floor(Math.max(0, Math.min(0.999999999, r)) * WORLD_BOSS_ATTACK_DROP_TOTAL);
  if (lucky) {
    // 행운: 앞 35%는 꽝, 나머지 65%를 꽝이 아닌 칸(50%)에 비율대로 펼친다.
    const miss = WORLD_BOSS_ATTACK_DROPS[0]!.p;
    if (x < WORLD_BOSS_LUCKY_MISS_P) return { diamond: 0, boxes: 0 };
    x = miss + Math.floor(((x - WORLD_BOSS_LUCKY_MISS_P) * (WORLD_BOSS_ATTACK_DROP_TOTAL - miss)) / (WORLD_BOSS_ATTACK_DROP_TOTAL - WORLD_BOSS_LUCKY_MISS_P));
  }
  for (const d of WORLD_BOSS_ATTACK_DROPS) {
    if (x < d.p) return { diamond: d.diamond, boxes: d.boxes };
    x -= d.p;
  }
  return { diamond: 0, boxes: 0 };
}

/**
 * 원정대원 전투력(2026-10-09 사용자 확정 — docs/WORLD-BOSS.md §3).
 * 장착한 장비 3개 각각 = 장비 전투력 × (1 + 아바타 보너스 + 약점 보너스), 둘은 더한다.
 *  - 아바타 보너스: 대표 아바타를 만들 때 입은 장비와 같은 부위 장비면 +50%. 약점 장비로 갈아입은 부위도 유지한다
 *    (아바타를 다시 만들 부담 없이 약점을 맞춰 입게 — 시뮬에서 정찰 가치를 살리는 조건).
 *  - 약점 보너스: 그 순간 보스 페이즈의 약점 장비면 +100%.
 */
export const WORLD_BOSS_AVATAR_BONUS = 0.5;
export const WORLD_BOSS_WEAK_BONUS = 1.0;
/** 페이즈 = 5단계마다(공격 중인 단계 1~5 → 0, 6~10 → 1 …). 약점은 소환 때 페이즈마다 부위별 10개를 뽑아 고정한다. */
export const WORLD_BOSS_PHASE_STAGES = 5;
export const WORLD_BOSS_WEAK_PER_SLOT = 10;
/** 뽑아 두는 페이즈 수 — 마지막 페이즈 뒤로는 마지막 약점이 이어진다(30단계 상한 + 여유). */
export const WORLD_BOSS_PHASES = 7;
/** 공격 중인 단계(1부터) → 페이즈 인덱스. */
export function worldBossPhaseOf(attackingStage: number): number {
  return Math.min(WORLD_BOSS_PHASES - 1, Math.floor(Math.max(0, attackingStage - 1) / WORLD_BOSS_PHASE_STAGES));
}
/**
 * 약점 적중 행운(2026-10-09 확정): 한 공격에서 약점 장비를 2개 이상 맞히면 공격 보상 꽝이 50% → 35%.
 * 나머지 칸은 비율 그대로 늘린다(65/50 = 1.3배). 부위별 10개라 1개 적중은 아무 장비로도 흔해(공격 58%) 2개 이상으로 둔다.
 */
export const WORLD_BOSS_LUCKY_MIN_WEAK = 2;
export const WORLD_BOSS_LUCKY_MISS_P = 35_000;

/** 단계 k(1부터)를 넘기는 데 필요한 피해. */
export function worldBossStageHp(stage: number): number {
  return Math.round(WORLD_BOSS_STAGE_BASE_HP * Math.pow(WORLD_BOSS_STAGE_GROWTH, Math.max(0, stage - 1)));
}
/** 누적 피해 → 넘긴 단계 수와 현재 단계 진행(into/need). 단계는 끝이 없다. */
export function worldBossStageFor(totalDamage: number): { stage: number; into: number; need: number } {
  let stage = 0;
  let rest = Math.max(0, Math.floor(totalDamage));
  let need = worldBossStageHp(1);
  // 보호 상한 — 피해가 비정상적으로 커도 루프가 끝난다(10,000단계 ≈ BASE × 1.1^10000, 실제로는 닿지 않는다).
  while (rest >= need && stage < 10_000) {
    rest -= need;
    stage++;
    need = worldBossStageHp(stage + 1);
  }
  return { stage, into: rest, need };
}
/** 단계 수 → 쌓이는 길드 전리품(상한 단계까지만). */
export function worldBossLootFor(stage: number): { diamond: number; boxes: number } {
  const n = Math.max(0, Math.min(stage, WORLD_BOSS_LOOT_STAGE_CAP));
  return { diamond: n * WORLD_BOSS_LOOT_PER_STAGE.diamond, boxes: n * WORLD_BOSS_LOOT_PER_STAGE.boxes };
}
/** 원정대원 1인의 평균 공격 횟수 = (인원 + 1) ÷ 2 — 모집 화면 안내용. */
export function worldBossExpectedAttacks(members: number): number {
  return members <= 0 ? 0 : (members + 1) / 2;
}
