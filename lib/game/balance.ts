/**
 * 수치 단일 진실 원천 (Single Source of Truth).
 *
 * `docs/BALANCE.md` 와 **1:1 일치 필수** — 불일치는 게임산업법 §33 형사처벌 위험
 * (CLAUDE §3.5). 게임 내 표시·확률 공시(/probability)·서버 판정 모두 이 모듈만 참조.
 * 변경 시: BALANCE.md 동시 수정 + `probability_snapshots` 영구 기록 + 24h 사전 공지.
 *
 * 확률·성공률은 **bp(basis points / 만분율)**: 10000 = 100%.
 *
 * 본 파일 §번호 = BALANCE.md §번호.
 */

// ─────────────────────────────────────────────────────────────────────────────
// §1. 강화 — 시간 곡선 & effective rate & baseRate & 실패 분기
// ─────────────────────────────────────────────────────────────────────────────

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

/** 단조 증가 앵커 보간 헬퍼. anchors는 x 오름차순 `[x, y]`. 범위 밖은 양끝 클램프. */
function lerpAnchors(anchors: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i]!;
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1]!;
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return last[1];
}

/**
 * §1.1 1회 강화 시도 소요 시간 d(L) — `fromLevel → fromLevel+1` (ms).
 *
 * 모든 카탈로그/슬롯 동일 곡선(BALANCE §1.1). 앵커는 **누적 도달 시간**
 * (+30≈24h · +50≈3일 · +99≈2주, full-wait)이며, 아래 per-attempt 값은
 * 그 누적을 baseRate(§1.3)·평균 재시도와 함께 충족하도록 한 **추천 시작값** —
 * `scripts/simulate-enhance`(Vitest balance)로 정밀화한다.
 */
const ENHANCE_DURATION_LOW: Record<number, number> = {
  0: 3 * SEC,
  1: 6 * SEC,
  2: 12 * SEC,
  3: 25 * SEC,
  4: 50 * SEC,
  5: 2 * MIN,
  6: 4 * MIN,
  7: 8 * MIN,
  8: 15 * MIN,
};
/** L≥9 구간 per-attempt 시간 앵커 (BALANCE §1.1, 단조 비감소). */
const ENHANCE_DURATION_ANCHORS = [
  [9, 20 * MIN],
  [10, 20 * MIN],
  [20, 50 * MIN],
  [30, 70 * MIN],
  [35, 75 * MIN],
  [40, 80 * MIN],
  [50, 85 * MIN],
  [60, 85 * MIN],
  [75, 90 * MIN],
  [90, 90 * MIN],
  [99, 90 * MIN],
  [100, 90 * MIN],
] as const;

export function enhanceDurationMs(fromLevel: number): number {
  const lv = Math.max(0, Math.floor(fromLevel));
  if (lv in ENHANCE_DURATION_LOW) return ENHANCE_DURATION_LOW[lv]!;
  return Math.round(lerpAnchors(ENHANCE_DURATION_ANCHORS, lv));
}

/** §1.1 누적 도달 시간 앵커(검증용) — full-wait 평균. 시뮬이 이 값을 충족해야 함. */
export const CUMULATIVE_REACH_ANCHORS_MS = {
  30: 24 * HOUR,
  50: 3 * 24 * HOUR,
  99: 14 * 24 * HOUR,
} as const;

/**
 * §1.1 +100 이상 강화 시도부터 매 시도 같은 카탈로그 아이템 1개를 제물로 소모
 * (강화·초월 레벨 무관, +0 가능 — 초월 제물 규칙과 동일).
 */
export const FODDER_REQUIRED_FROM_LEVEL = 100;
export const FODDER_PER_ATTEMPT = 1;

/**
 * §1.2 시간 비례 effective rate.
 * `p_eff = baseRate × clamp(elapsed/total, 0, 1)`. 완료 대기 시 공시 baseRate 도달.
 * RNG는 시도 시점 서버에서만 (CLAUDE §3.1).
 */
export function effectiveRateBp(baseRateBp: number, elapsedMs: number, totalMs: number): number {
  if (totalMs <= 0) return baseRateBp;
  const frac = Math.min(1, Math.max(0, elapsedMs / totalMs));
  return Math.round(baseRateBp * frac);
}

/**
 * §1.3 강화 단계별 공시 성공률 baseRate(L) — bp.
 * +0~9 100% / +10~51 100→50%(실패=유지) / +52~ 48→10%(실패 −1 하락) / +100~ 10% 고정.
 */
const BASE_RATE_ANCHORS = [
  [10, 10000],
  [20, 8500],
  [30, 7000],
  [40, 5800],
  [51, 5000],
  [52, 4800],
  [60, 3800],
  [75, 2500],
  [90, 1500],
  [99, 1000],
  [100, 1000],
] as const;

export function baseSuccessRateBp(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  if (lv <= 9) return 10000;
  if (lv >= 100) return 1000;
  return Math.round(lerpAnchors(BASE_RATE_ANCHORS, lv));
}

/** §1.3 안전 구간 상한 — 이 레벨 이하에서 실패 시 항상 유지(하락 없음). */
export const SAFE_MAX_LEVEL = 51;

export type EnhanceFailOutcome = 'hold' | 'down';

/**
 * §1.3 실패 결과 분기. +0~+51 실패=유지(안전), +52~ 실패=−1 하락.
 * **파괴 없음**(개념 자체 미도입). 하락 하한 = +51(안전 구간 회귀).
 */
export function failOutcome(fromLevel: number): EnhanceFailOutcome {
  return fromLevel > SAFE_MAX_LEVEL ? 'down' : 'hold';
}

/** 실패(하락) 시 결과 레벨. hold면 fromLevel 그대로, down이면 max(51, fromLevel-1). */
export function levelAfterFail(fromLevel: number): number {
  if (failOutcome(fromLevel) === 'hold') return fromLevel;
  return Math.max(SAFE_MAX_LEVEL, fromLevel - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// §2. 초월 — 제물 수 & 전투력 % 배수
// ─────────────────────────────────────────────────────────────────────────────

/** §2 초월 상한. transcend_level ∈ [0, 10] (SCHEMA CHECK 제약과 1:1). */
export const MAX_TRANSCEND = 10;

/**
 * §2.1 `toLevel` 단계(=T-1 → T) 달성에 필요한 같은 카탈로그 아이템 제물 수.
 * 선형 1→10 (0→1:1 … 9→10:10). 누적 풀 초월(10) = 55.
 * 제물: 같은 카탈로그 아이템이면 강화·초월 레벨 무관(+0 가능, GDD §3.3).
 */
export function transcendFodderForStep(toLevel: number): number {
  if (toLevel < 1 || toLevel > MAX_TRANSCEND) {
    throw new Error(`INVALID_TRANSCEND_STEP:${toLevel}`);
  }
  return toLevel;
}

/** §2.1 0 → targetT 까지 누적 제물 수 (검증/표시용). */
export function transcendFodderCumulative(targetT: number): number {
  let sum = 0;
  for (let t = 1; t <= Math.min(targetT, MAX_TRANSCEND); t++) sum += transcendFodderForStep(t);
  return sum;
}

/**
 * §2.2 초월 레벨 T의 전투력 % 배수 — bp. 가속 곡선, T10 = +100%(×2.0).
 * 개별 장비 전투력 = (강화 기반 전투력) × (1 + transcendBonusBp[T]/10000).
 */
const TRANSCEND_BONUS_BP: readonly number[] = [
  0, 500, 1100, 1800, 2600, 3500, 4500, 5600, 6800, 8200, 10000,
] as const;

export function transcendBonusBp(transcendLevel: number): number {
  const t = Math.max(0, Math.min(MAX_TRANSCEND, Math.floor(transcendLevel)));
  return TRANSCEND_BONUS_BP[t]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3. 전투력
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §3.1 강화 레벨 → 기반 전투력 P(L) = round(10 × (1+L)^1.5). 초선형.
 * 모든 카탈로그 아이템 동일(베이스 차등 없음, GDD §3.1).
 */
export function enhanceBasePower(enhanceLevel: number): number {
  const lv = Math.max(0, Math.floor(enhanceLevel));
  return Math.round(10 * Math.pow(1 + lv, 1.5));
}

/** §3.2 개별 장비 전투력 = P(L) × (1 + transcendBonus[T]). */
export function pieceCombatPower(enhanceLevel: number, transcendLevel: number): number {
  const base = enhanceBasePower(enhanceLevel);
  return Math.round(base * (1 + transcendBonusBp(transcendLevel) / 10000));
}

/** §3.2 도감 보너스 계수 (총 전투력 = (착용 합) × (1 + 도감강화합 × 0.005)). */
export const CODEX_BONUS_COEFF = 0.005;

/**
 * §3.2 총 전투력 = (착용 3장비 전투력 합) × (1 + 도감강화합 × 0.005).
 * `codexEnhanceSum` = 도감에 기록된 카탈로그 아이템별 최고 강화 레벨의 합 (SCHEMA §2.3).
 */
export function totalCombatPower(equippedPieceCPs: readonly number[], codexEnhanceSum: number): number {
  const sum = equippedPieceCPs.reduce((a, b) => a + b, 0);
  return Math.round(sum * (1 + Math.max(0, codexEnhanceSum) * CODEX_BONUS_COEFF));
}

// ─────────────────────────────────────────────────────────────────────────────
// §4. 보급 (보급 상자)
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPLY_SLOTS = ['weapon', 'armor', 'accessory'] as const;
export type SupplySlot = (typeof SUPPLY_SLOTS)[number];

/**
 * §4.2 슬롯 박스 내 아이템 균등 확률 = 1 / (해당 슬롯 현재 활성 카탈로그 종수).
 * 종수 가변 → 고정 수치 아님, **규칙**. 천장 없음. 게임산업법 §33 공시.
 */
export function supplyItemProbability(slotActiveCatalogCount: number): number {
  if (slotActiveCatalogCount <= 0) return 0;
  return 1 / slotActiveCatalogCount;
}

/** §4.3 분해 보상 = 고정 다이아 (강화·초월 레벨 무관). 보급 개봉 보석 드롭 폐기(확률형 제거). */
export const DIAMOND_PER_DISENCHANT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// §5. 레이드 (플레이어 호스팅 co-op)
// ─────────────────────────────────────────────────────────────────────────────

export const RAID_OPEN_COST_DIAMOND = 1000;
export const RAID_MAX_PARTICIPANTS = 10; // 호스트 포함
export const RAID_MAX_CONCURRENT_PER_USER = 3; // 호스팅+참여 합산
export const RAID_DAILY_CAP = 5; // 유저당 1일(KST)
export const RAID_WINDOW_MS = 6 * HOUR; // 개설 후 공격창
export const RAID_BASE_ATTACKS = 10; // 참여자당 기본

/**
 * §5.5 n번째 추가 공격 비용(다이아) — 10번 단위 단계 상승.
 * 1~10번째: 50, 11~20: 100, 21~30: 150, 31~40: 200, …
 * = 50 × ceil(n / 10). n ≥ 1.
 */
export function raidExtraAttackCost(nth: number): number {
  const n = Math.max(1, Math.floor(nth));
  return 50 * Math.ceil(n / 10);
}

/** §5.2 phase1 HP 범위. phase n HP = phase1 × 1.5^(n-1). */
export const RAID_PHASE1_HP_MIN = 8000;
export const RAID_PHASE1_HP_MAX = 12000;
export const RAID_PHASE_HP_MULT = 1.5;

export function raidPhaseHp(phase1Hp: number, phaseNumber: number): number {
  const n = Math.max(1, Math.floor(phaseNumber));
  return Math.round(phase1Hp * Math.pow(RAID_PHASE_HP_MULT, n - 1));
}

/** §5.3 데미지. 미스 없음. 크리 5%/×1.5. 분산 ±30%. 캡 없음. */
export const RAID_CRIT_RATE_BP = 500; // 5%
export const RAID_CRIT_MULT = 1.5;
export const RAID_DAMAGE_VARIANCE = 0.3; // ±30% → 분산 계수 ∈ [0.7, 1.3]
export const RAID_DAMAGE_K = 1.0; // 추천 시작값(시뮬 조정)

/**
 * §5.3 1회 공격 데미지 = round(총전투력 × K × varFactor × (crit?1.5:1)).
 * RNG는 호출자(서버)에서 결정해 주입 — varFactor∈[0.7,1.3], isCrit (CLAUDE §3.1).
 */
export function computeRaidDamage(totalCP: number, varFactor: number, isCrit: boolean): number {
  const v = Math.min(1 + RAID_DAMAGE_VARIANCE, Math.max(1 - RAID_DAMAGE_VARIANCE, varFactor));
  return Math.round(totalCP * RAID_DAMAGE_K * v * (isCrit ? RAID_CRIT_MULT : 1));
}

/** §5.4 보상 — 1회+ 공격 전원 동일. 기본 참가 + 페이즈 돌파마다 1회 추첨. */
export const RAID_BASE_PARTICIPATION_DIAMOND = 100;
export const RAID_PHASE_DROP_DIAMOND = 100;
export const RAID_PHASE_DROP_DIAMOND_RATE_BP = 5000; // 50% 다이아 / 50% 슬롯 랜덤 보급 상자
/** 보급 상자 당첨 시 슬롯 균등 — SUPPLY_SLOTS 중 1/3. (RNG는 서버에서) */

// ─────────────────────────────────────────────────────────────────────────────
// §6. 경제 — 단일 프리미엄 재화 (다이아 ≡ 보석)
// ─────────────────────────────────────────────────────────────────────────────

/** §6.2 강화 시간 단축 환산: 1 다이아 = 1분. (등록 시점 값 영구 — 소급 금지, CLAUDE §6.3) */
export const GEM_TO_MS = 1 * MIN;

/** 남은 시간 ms 를 즉시 완료하는 데 필요한 다이아 (올림). */
export function diamondToFinishMs(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / GEM_TO_MS));
}

/** §6.3 공유 보상: 1일 1회 100 다이아 (보급 상자 없음). 가입 전환 시 공유자 +300. */
export const SHARE_DAILY_REWARD_DIAMOND = 100;
export const REFERRAL_CONVERSION_DIAMOND = 300;

/** §6.4 광고 보상: 1회 = 슬롯 랜덤 보급 상자 1개. 일일 한도. (보석 직접 지급 없음) */
export const AD_DAILY_CAP = 5;
export const AD_REWARD_SUPPLY_BOXES = 1;
