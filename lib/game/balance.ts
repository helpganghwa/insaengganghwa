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
// §1. 강화 — 사이클(100단위) 시간 곡선 & 3분기 outcome 확률
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
 * §1.0 사이클(cycle) — 100단위로 강화 곡선이 리셋되고 시도 시간이 2배씩 증가.
 * cycle = floor(L / 100), cycleLevel ℓ = L mod 100 ∈ [0, 99].
 * 사이클 시간 배수 = 2^cycle (cycle0 = 1배, cycle1 = 2배, cycle2 = 4배 …).
 * 모든 확률(성공·하락)은 ℓ만의 함수. 사이클 무한 진행 — 도달할수록 시간만 지수 증가.
 */
export const CYCLE_LEN = 100;
export const CYCLE_TIME_BASE = 2;

export function cycleIndex(level: number): number {
  return Math.max(0, Math.floor(level / CYCLE_LEN));
}
export function cycleLevel(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  return lv % CYCLE_LEN;
}
export function cycleTimeMultiplier(level: number): number {
  return Math.pow(CYCLE_TIME_BASE, cycleIndex(level));
}

/**
 * §1.1 1회 강화 시도 소요 시간 d(L) — `L → L+1` (ms).
 *
 * 사이클 0 곡선은 **piecewise 선형**(초반 온보딩 가속):
 *   ℓ ∈ [0, 10]  : D_MIN(10s)  → D_AT_10(10분)  — 가파른 진입 가속
 *   ℓ ∈ [10, 99]: D_AT_10(10분) → D_MAX(215분) — 후반 본 곡선
 * 사이클 시간 배수 2^cycle 적용:
 *   d(L) = d₀(ℓ) × 2^cycle
 *
 * +99 도달 ≈ 4주 설계 유지 — 후반 구간(+10~+99) 끝점은 변동 없음.
 */
export const ENHANCE_BASE_DURATION_MIN_MS = 10 * SEC;
export const ENHANCE_BASE_DURATION_AT_10_MS = 10 * MIN;
export const ENHANCE_BASE_DURATION_MAX_MS = 215 * MIN;
const EARLY_BREAKPOINT_LV = 10;

/** 사이클 0 기준 ℓ → 한 시도 시간. 사이클 시간 배수는 enhanceDurationMs에서 곱함. */
export function baseAttemptDurationMs(cycleLv: number): number {
  const lv = Math.max(0, Math.min(CYCLE_LEN - 1, Math.floor(cycleLv)));
  if (lv <= EARLY_BREAKPOINT_LV) {
    const span = ENHANCE_BASE_DURATION_AT_10_MS - ENHANCE_BASE_DURATION_MIN_MS;
    return Math.round(ENHANCE_BASE_DURATION_MIN_MS + (span * lv) / EARLY_BREAKPOINT_LV);
  }
  const span = ENHANCE_BASE_DURATION_MAX_MS - ENHANCE_BASE_DURATION_AT_10_MS;
  return Math.round(
    ENHANCE_BASE_DURATION_AT_10_MS +
      (span * (lv - EARLY_BREAKPOINT_LV)) / (CYCLE_LEN - 1 - EARLY_BREAKPOINT_LV),
  );
}

/** 전체 진행 속도 2배 — 시도 시간만 ÷ 2 (사용자 결정 2026-05-31).
 *  확률(baseRate/downRate/mega)은 불변, 도달 시간만 정확히 반으로. */
export const ATTEMPT_DURATION_SCALE = 0.5;

export function enhanceDurationMs(fromLevel: number): number {
  return Math.round(
    baseAttemptDurationMs(cycleLevel(fromLevel)) *
      cycleTimeMultiplier(fromLevel) *
      ATTEMPT_DURATION_SCALE,
  );
}

/**
 * §1.1 누적 도달 시간 설계 목표(full-wait 평균). 2026-05-31 속도 2배 적용으로
 * 직전 anchors의 ÷ 2 (30: 24→12h / 50: 3일→36h / 99: 28일→14일).
 * `bun run scripts/analyze-enhance.ts`가 실제 평균 산출.
 */
export const CUMULATIVE_REACH_ANCHORS_MS = {
  30: 12 * HOUR,
  50: 36 * HOUR,
  99: 14 * 24 * HOUR,
} as const;


/**
 * §1.3 사이클 내 공시 성공률 baseRate(ℓ) — bp. 모든 사이클 동일 곡선(ℓ만의 함수).
 * 안전 구간(ℓ 0~51)은 종전 곡선(100→50%). 위험 구간(ℓ 52~99)은 high-level up 상향:
 * +99 = 25%·+90 = 30%·+75 = 40%. 사이클 0에서 +99 도달 평균 ≈ 15일(BALANCE §1.1).
 */
const BASE_RATE_ANCHORS = [
  [10, 10000],
  [20, 8500],
  [30, 7000],
  [40, 5800],
  [51, 5000],
  [52, 4800],
  [60, 4200],
  [75, 4000],
  [90, 3000],
  [99, 2500],
] as const;

export function baseSuccessRateBp(level: number): number {
  const lv = cycleLevel(level);
  if (lv <= 9) return 10000;
  return Math.round(lerpAnchors(BASE_RATE_ANCHORS, lv));
}

/** §1.3 안전 구간 상한 — 사이클 내 이 이하 ℓ는 하락 0%(=실패=유지). */
export const SAFE_MAX_LEVEL = 51;

/**
 * §1.3 사이클 내 하락 확률 downRate(ℓ) — bp **고정**(시간에 무관).
 * ℓ ≤ 51 = 0%(안전). 위험 구간은 +52=8% → +99=15% — up 곡선과 독립으로 설계해
 * 모든 ℓ에서 drift(up−down) > 0 유지(=+99 도달 평균 ≈ 15일). 불변식: up+down ≤ 100%.
 */
const DOWN_RATE_ANCHORS = [
  [52, 800],
  [60, 1200],
  [75, 1500],
  [90, 1500],
  [99, 1500],
] as const;

export function downRateBp(level: number): number {
  const lv = cycleLevel(level);
  if (lv <= SAFE_MAX_LEVEL) return 0;
  return Math.round(lerpAnchors(DOWN_RATE_ANCHORS, lv));
}

export type EnhanceFailOutcome = 'hold' | 'down';

/**
 * §1.3 (레거시) 실패 결과 분기 — 사이클 내 ℓ 기준. ℓ≤51 hold, ℓ>51 down.
 * 새 3분기 모델에선 effectiveOutcomeProbsBp가 진실 — 본 함수는 down이 *가능한지* 만 표현.
 */
export function failOutcome(fromLevel: number): EnhanceFailOutcome {
  return downRateBp(fromLevel) > 0 ? 'down' : 'hold';
}

/**
 * 실패(하락) 시 결과 레벨. 항상 −1, **하한 = 사이클 내 +51**(=cycle_start+51).
 * 사이클 경계를 가로지르지 않음(예: +152→+151 OK, +100→+99 불가 — +100은 안전구간이라 그 자체로 down 발생 0%).
 */
export function levelAfterFail(fromLevel: number): number {
  if (downRateBp(fromLevel) === 0) return fromLevel;
  const cycleStart = cycleIndex(fromLevel) * CYCLE_LEN;
  return Math.max(cycleStart + SAFE_MAX_LEVEL, fromLevel - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.2 시간 비례 3분기 outcome 확률
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §1.2 (레거시) 시간 비례 effective success rate.
 * `p_eff = baseRate × clamp(elapsed/total, 0, 1)`. 완료 대기 시 공시 baseRate 도달.
 * resolve.ts 3분기 분기는 effectiveOutcomeProbsBp 사용 — 본 함수는 로깅·표시용.
 */
export function effectiveRateBp(baseRateBp: number, elapsedMs: number, totalMs: number): number {
  if (totalMs <= 0) return baseRateBp;
  const frac = Math.min(1, Math.max(0, elapsedMs / totalMs));
  return Math.round(baseRateBp * frac);
}

/** §1.2.1 메가 강화 — success 확률 안에서 5% 분리. +2 단계 상승. */
export const MEGA_OF_SUCCESS_BP = 500;

export type OutcomeProbsBp = {
  /** 성공 확률 bp — 시간에 따라 0 → baseRate 선형 상승(mega 제외 분량). */
  success: number;
  /** 메가 확률 bp — success_total의 MEGA_OF_SUCCESS_BP%. +2. */
  mega: number;
  /** 유지 확률 bp — 시간에 따라 (1−down) → (1−base−down)으로 선형 감소. */
  hold: number;
  /** 하락 확률 bp — 시간 무관 고정(downRate). */
  down: number;
};

/**
 * §1.2 시간 t에서의 4분기 확률 (bp 합 = 10000).
 *   p_success_total(t) = baseRate(ℓ) × clamp(elapsed/total)
 *   p_mega(t)          = p_success_total × MEGA_OF_SUCCESS_BP / 10000
 *   p_success(t)       = p_success_total − p_mega
 *   p_down             = downRate(ℓ)
 *   p_hold(t)          = 10000 − p_success_total − p_down
 * 불변식: baseRate + downRate ≤ 10000 → p_hold ≥ 0.
 */
export function effectiveOutcomeProbsBp(
  baseRateBp: number,
  downBp: number,
  elapsedMs: number,
  totalMs: number,
): OutcomeProbsBp {
  const successFrac = totalMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / totalMs));
  const successTotal = Math.round(baseRateBp * successFrac);
  const mega = Math.floor((successTotal * MEGA_OF_SUCCESS_BP) / 10000);
  const success = successTotal - mega;
  const down = Math.max(0, Math.min(10000 - successTotal, downBp));
  const hold = Math.max(0, 10000 - successTotal - down);
  return { success, mega, hold, down };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2. 초월 — 제물 수 & 전투력 % 배수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §2 초월은 **무한 진행**(사용자 결정, 2026-05-21). T10 이상은 디자인/수치 모두 T10과
 * 동일하게 처리 — 시각 등급 클램프(transcend.ts) + 제물 수 10 고정 + 보너스 +100% 고정.
 * MAX_TRANSCEND는 **시각 등급 매핑 cap**으로만 유지(0..10 LADDER 인덱스).
 */
export const MAX_TRANSCEND = 10;

/**
 * §2.1 `toLevel` 단계(=T-1 → T) 달성에 필요한 같은 카탈로그 아이템 제물 수.
 * 선형 1→10 (0→1:1 … 9→10:10). T11+ = 10 고정(무한 진행, 디자인 동일).
 * 제물: 같은 카탈로그 아이템이면 강화·초월 레벨 무관(+0 가능, GDD §3.3).
 */
export function transcendFodderForStep(toLevel: number): number {
  if (toLevel < 1) throw new Error(`INVALID_TRANSCEND_STEP:${toLevel}`);
  return Math.min(toLevel, MAX_TRANSCEND);
}

/** §2.1 0 → targetT 까지 누적 제물 수 (검증/표시용). T11+는 10 고정 누적. */
export function transcendFodderCumulative(targetT: number): number {
  let sum = 0;
  for (let t = 1; t <= targetT; t++) sum += transcendFodderForStep(t);
  return sum;
}

/**
 * §2.2 초월 레벨 T의 전투력 % 배수 — bp. 가속 곡선, T10 = +100%(×2.0).
 * T11+ = T10과 동일(+100%) — 무한 진행이지만 보너스는 캡(디자인 동일 의도).
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

// 총 전투력(보유 카탈로그 중복 제외 합)은 dedup 그룹핑이 필요해
// `lib/game/equipment/combat-power.ts`에서 pieceCombatPower로 계산한다.

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

/** §4.3 분해 보상 = 고정 다이아 (강화·초월 레벨 무관). 보급 열기 보석 드롭 폐기(확률형 제거). */
export const DIAMOND_PER_DISENCHANT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// §5. 레이드 (플레이어 호스팅 co-op)
// ─────────────────────────────────────────────────────────────────────────────

export const RAID_OPEN_COST_DIAMOND = 500;
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

/**
 * §5.4 보상 — 1회+ 공격 전원 동일. 기본 참가 보상 없음.
 * 돌파 페이즈마다 **보급 상자 1개**(슬롯 균등 1/3) 지급 — 다이아 드롭 없음.
 * 레이드는 초월용 박스 수급의 *보조* 경로(시뮬 simulate-raid-boxes: 무과금 패시브 대비
 * 보통 ×1.4~1.7, 천장 ×3.3 — 1개 고정 채택. 1~3개는 헤비/고래 ×4~6.6로 과공급).
 */
export const RAID_PHASE_DROP_BOXES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// §6. 경제 — 단일 프리미엄 재화 (다이아 ≡ 보석)
// ─────────────────────────────────────────────────────────────────────────────

/** §6.2 강화 시간 단축 환산: 1 다이아 = 1분. (등록 시점 값 영구 — 소급 금지, CLAUDE §6.3) */
export const GEM_TO_MS = 1 * MIN;

/** 남은 시간 ms 를 즉시 완료하는 데 필요한 다이아 (올림). */
export function diamondToFinishMs(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / GEM_TO_MS));
}

/** §6.5 닉네임 변경 — 첫 변경 무료, 이후 매 변경마다 차감. */
export const NICKNAME_CHANGE_COST_DIAMOND = 1000;

/**
 * §6.6 캐릭터 프로필 생성 — Pixellab v2 Pro + Claude vision 자동 검토 비용 포함.
 * **[TBD]** 5000 vs 10000 최종 결정은 운영 시작 후 USD 실측 + 어뷰징 신호 보고.
 * v1 default = 10000 (1다=1분 환산 ≈ 7일치 플레이, 프리미엄 자기표현 가치).
 * AI 검토 거절 시 100% 환불(PROFILE §5.1·§6).
 */
export const PROFILE_GENERATION_DIAMOND = 10_000;

// §6.4 광고 보상 — v1 미도입(사용자 결정). 모바일 웹은 보상형 광고 SDK SSV
// 인프라가 약해 치트 방어가 어렵고 1인 운영 부담이 큼. 상점에 광고 제거 IAP는
// 향후 도입 검토(광고 노출 자체 OFF). 향후 네이티브 wrapper 도입 시 재검토.

// ─────────────────────────────────────────────────────────────────────────────
// §7. 출석 캘린더 — 28일 누적·반복
// ─────────────────────────────────────────────────────────────────────────────

/** §7.1 28일 1사이클 길이. 28칸 완료 후 다음 접속일 1칸으로 롤. */
export const CHECKIN_CYCLE_DAYS = 28;

export type CheckinReward =
  | { kind: 'diamond'; amount: number }
  | { kind: 'supply'; slot: SupplySlot; count: number }
  | { kind: 'supply_set'; perSlot: number };

/**
 * §7.1 출석 캘린더 보상 — 1-index(1~28). BALANCE.md §7.1 표와 1:1.
 * 평일 6일 순환(무기→💎→방어구→💎→장신구→💎) + 7일째마다 마일스톤 4종 순환
 * (보급권 30 → 💎2,000 → 보급권 60 → 💎5,000).
 */
export const CHECKIN_CALENDAR: readonly CheckinReward[] = [
  { kind: 'supply', slot: 'weapon', count: 10 }, // 1
  { kind: 'diamond', amount: 500 }, // 2
  { kind: 'supply', slot: 'armor', count: 10 }, // 3
  { kind: 'diamond', amount: 500 }, // 4
  { kind: 'supply', slot: 'accessory', count: 10 }, // 5
  { kind: 'diamond', amount: 500 }, // 6
  { kind: 'supply_set', perSlot: 10 }, // 7 ★
  { kind: 'supply', slot: 'weapon', count: 10 }, // 8
  { kind: 'diamond', amount: 500 }, // 9
  { kind: 'supply', slot: 'armor', count: 10 }, // 10
  { kind: 'diamond', amount: 500 }, // 11
  { kind: 'supply', slot: 'accessory', count: 10 }, // 12
  { kind: 'diamond', amount: 500 }, // 13
  { kind: 'diamond', amount: 2000 }, // 14 ★
  { kind: 'supply', slot: 'weapon', count: 10 }, // 15
  { kind: 'diamond', amount: 500 }, // 16
  { kind: 'supply', slot: 'armor', count: 10 }, // 17
  { kind: 'diamond', amount: 500 }, // 18
  { kind: 'supply', slot: 'accessory', count: 10 }, // 19
  { kind: 'diamond', amount: 500 }, // 20
  { kind: 'supply_set', perSlot: 20 }, // 21 ★
  { kind: 'supply', slot: 'weapon', count: 10 }, // 22
  { kind: 'diamond', amount: 500 }, // 23
  { kind: 'supply', slot: 'armor', count: 10 }, // 24
  { kind: 'diamond', amount: 500 }, // 25
  { kind: 'supply', slot: 'accessory', count: 10 }, // 26
  { kind: 'diamond', amount: 500 }, // 27
  { kind: 'diamond', amount: 5000 }, // 28 ★
] as const;

/** §7.1 7일째 마일스톤 칸(1-index)인지 — UI 강조용. */
export function isCheckinMilestone(cycleDay1Indexed: number): boolean {
  return cycleDay1Indexed > 0 && cycleDay1Indexed % 7 === 0;
}

/**
 * §7.3 state.dayProgress(0~27 = 마지막 수령 칸의 0-index) → 다음 수령 칸 1-index(1~28).
 * 초기값 0 / 막 수령 직후 1 → 다음 칸은 ((dp) % 28) + 1.
 */
export function nextCheckinDay1Indexed(dayProgress: number): number {
  const dp = Math.max(0, Math.min(CHECKIN_CYCLE_DAYS - 1, Math.floor(dayProgress)));
  return dp + 1;
}

/** §7.3 수령 직후 advance — `(dp + 1) % 28`. 28번째 수령하면 0으로 롤(다음 사이클 D1 대기). */
export function advanceCheckinDayProgress(dayProgress: number): number {
  return (Math.max(0, Math.floor(dayProgress)) + 1) % CHECKIN_CYCLE_DAYS;
}

/** §7.1 day(1~28) → 보상. 범위 밖은 throw. */
export function checkinRewardForDay(day1Indexed: number): CheckinReward {
  const d = Math.floor(day1Indexed);
  if (d < 1 || d > CHECKIN_CYCLE_DAYS) throw new Error(`INVALID_CHECKIN_DAY:${d}`);
  return CHECKIN_CALENDAR[d - 1]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8. 대난투 (Grand Melee) — MELEE.md. 단일 글로벌 결정론 난투.
// ─────────────────────────────────────────────────────────────────────────────

/** 시작 HP = 전투력 × 배수. */
export const MELEE_HP_MULT = 2;
/** 1회 타격 데미지 = 공격자 전투력 × U(MIN, MAX). 항상 명중. */
export const MELEE_DMG_MIN = 0.5;
export const MELEE_DMG_MAX = 1.2;
/**
 * 리플레이 보존 라운드 — 총 라운드 ≤ 이 값이면 전체, 초과면 **마지막 이 라운드만**(클라이맥스).
 * 링 버퍼로 O(이 값) 메모리 → N(참가자)=1천만이어도 재생/저장 일정. MELEE §8.
 */
export const MELEE_REPLAY_ROUNDS = 1000;
/**
 * "내 전투" 미니로그 — 참가자별 본인 관여 이벤트 최대 보존 수(등수·규모 무관 항상 조회).
 * 유저당 실제 ~5~10전이라 거의 안 닿는 안전 상한.
 */
export const MELEE_MY_EVENTS_MAX = 40;

export type MeleeReward = { diamond: number; boxes: number };

/**
 * 등수(1-base) + 총 참가자 N → 보상. 티어 배타(스캔 순서로 첫 매칭 1개만). MELEE §6.
 * 1위 💎1000+10 · 2~3위 💎500+5 · 상위5% 💎200+3 · 상위20% 💎100+2 · 상위50% 💎50+2 · 나머지 상자1.
 */
export function meleeRewardForRank(rank: number, n: number): MeleeReward {
  if (rank <= 1) return { diamond: 1000, boxes: 10 };
  if (rank <= 3) return { diamond: 500, boxes: 5 };
  if (rank <= Math.ceil(n * 0.05)) return { diamond: 200, boxes: 3 };
  if (rank <= Math.ceil(n * 0.2)) return { diamond: 100, boxes: 2 };
  if (rank <= Math.ceil(n * 0.5)) return { diamond: 50, boxes: 2 };
  return { diamond: 0, boxes: 1 };
}
