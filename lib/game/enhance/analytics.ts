/**
 * 강화 누적 도달 시간 — 해석적 expected first-passage time.
 * BALANCE §1 모델(사이클 내 random walk + 반사벽 +51 + 흡수벽 +99)의 1차 통과시간을
 * D(ℓ)/T(ℓ) 점화식으로 즉시 계산. Monte Carlo 시뮬 불요.
 *
 * 사용처: `scripts/analyze-enhance.ts`.
 */

import {
  baseAttemptDurationMs,
  baseSuccessRateBp,
  downRateBp,
  cycleTimeMultiplier,
  CYCLE_LEN,
} from '@/lib/game/balance';

export type CycleReach = {
  /** D(ℓ) — ℓ→ℓ+1로 진행되는 1단계 평균 시간(ms). 누적 도달 시간의 building block. */
  stepMs: number[];
  /** T(ℓ) — ℓ에서 +99 도달까지 남은 평균 시간(ms). T[99]=0. */
  remainingMs: number[];
  /** ℓ별 단일 시도 d(ℓ) — baseAttemptDurationMs(ℓ) (사이클 0 기준). */
  attemptMs: number[];
};

/** 사이클 0 기준 random walk 1차 통과시간. ℓ ∈ [0, 99]. */
export function computeCycleZeroReach(): CycleReach {
  const up: number[] = [];
  const down: number[] = [];
  const d: number[] = [];
  for (let l = 0; l < CYCLE_LEN; l++) {
    up.push(baseSuccessRateBp(l) / 10000);
    down.push(downRateBp(l) / 10000);
    d.push(baseAttemptDurationMs(l));
  }
  // D(ℓ) — 사이클 내 ℓ→ℓ+1 평균 시간. ℓ≤50은 항상 성공이라 D=d(ℓ).
  // ℓ=51은 항상 성공(반사벽 안쪽 마지막) — D=d(51).
  // ℓ≥52: D(ℓ) = (d(ℓ) + down(ℓ)*D(ℓ-1)) / up(ℓ)
  const D: number[] = new Array(CYCLE_LEN).fill(0);
  for (let l = 0; l <= 51; l++) D[l] = d[l]!;
  for (let l = 52; l <= 98; l++) D[l] = (d[l]! + down[l]! * D[l - 1]!) / up[l]!;
  // T(ℓ) — ℓ에서 +99까지 남은 시간. T[99]=0. T[ℓ] = D[ℓ] + T[ℓ+1].
  const T: number[] = new Array(CYCLE_LEN + 1).fill(0); // T[99]=0 (last index 99)
  for (let l = 98; l >= 0; l--) T[l] = D[l]! + T[l + 1]!;
  return { stepMs: D, remainingMs: T, attemptMs: d };
}

/** 글로벌 레벨 L에서 같은 사이클의 99(=100c+99)까지 도달하는 평균 시간(ms). */
export function reachWithinCycleMs(globalLevel: number, cycle0: CycleReach): number {
  const lv = Math.max(0, Math.floor(globalLevel));
  const ℓ = lv % CYCLE_LEN;
  return cycle0.remainingMs[ℓ]! * cycleTimeMultiplier(lv);
}

/**
 * 누적 도달 시간 +0 → 글로벌 레벨 L. 사이클 간 dynamics 동일하나 시간만 ×2^c.
 *  - L이 사이클 c 내라면: Σ_{c'<c}(2^c' × T_0(0)) + 2^c × (T_0(0) − T_0(ℓ))
 *  - 사이클 경계 통과(99→100) 추가 시간은 무시(추정 < 5%).
 */
export function cumulativeReachMs(globalLevel: number, cycle0: CycleReach): number {
  const lv = Math.max(0, Math.floor(globalLevel));
  const c = Math.floor(lv / CYCLE_LEN);
  const ℓ = lv % CYCLE_LEN;
  const T099 = cycle0.remainingMs[0]!; // 사이클 0 +0→+99
  let cum = 0;
  for (let k = 0; k < c; k++) cum += T099 * Math.pow(2, k);
  cum += Math.pow(2, c) * (T099 - cycle0.remainingMs[ℓ]!);
  return cum;
}
