/**
 * 강화 누적 도달 시간 — 해석적 계산(시뮬레이션 대신).
 * 사이클 내 random walk의 1차 통과시간(expected first-passage time)을 선형식으로 즉시 계산.
 * 결과는 시뮬과 동일하지만 millisecond 안에 끝남.
 *
 * 모델(BALANCE §1):
 *  - 사이클 내 ℓ에 대해 p_up=baseRate(ℓ), p_down=downRate(ℓ), p_hold=잔여(full-wait)
 *  - 반사벽: ℓ=51 (always success → 52)
 *  - 흡수벽: ℓ=99 (도달 시 종료)
 *  - 시도 시간 d(ℓ) = baseAttemptDurationMs(ℓ) × ATTEMPT_DURATION_SCALE × 2^cycle
 *
 * D(ℓ) = T(ℓ) - T(ℓ+1)  (∀ ℓ in 51..98)
 *   D(51) = d(51)
 *   D(ℓ) = (d(ℓ) + p_down(ℓ) D(ℓ-1)) / p_up(ℓ)   for 52..98
 *   T(ℓ) = Σ_{k=ℓ}^{98} D(k)                      for ℓ in 52..99 (T(99)=0)
 *   T(ℓ) = d(ℓ) + T(ℓ+1)                          for ℓ ≤ 51
 *
 * 사이클 c 내부 T_c(0)는 T_0(0) × 2^c (d만 스케일됨, 확률 동일).
 *
 * 사이클 경계 통과(99 → 100 — 새 사이클 진입): "L=99에서 success" 첫 발생까지의 평균.
 * 사이클 0 dynamics를 그대로 쓰되 absorbing을 L=100(=cycle1 진입)에서 잡으면, 사실상
 * T_0(0→99)와 동일 구조 + 마지막 99에서의 추가 expected attempts × d(99). 단순화를 위해:
 *   reach(100c + 99) = Σ_{c'=0..c} T_0(0) × 2^c'   (사이클별 0→99 시간의 합)
 * 사이클 전환 자체의 추가 시간(99→100 흡수)은 d(99) × 1/p_up(99) ≈ 90m × 10 = 15h로
 * 누적 도달의 5% 미만이라 무시.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baseAttemptDurationMs,
  baseSuccessRateBp,
  downRateBp,
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  ATTEMPT_DURATION_SCALE,
  CUMULATIVE_REACH_ANCHORS_MS,
} from '../lib/game/balance';

function computeCycleZero() {
  // 확률 (ℓ 0..99)
  const up = new Array(CYCLE_LEN).fill(0).map((_, l) => baseSuccessRateBp(l) / 10000);
  const down = new Array(CYCLE_LEN).fill(0).map((_, l) => downRateBp(l) / 10000);
  // 전체 2배속(ATTEMPT_DURATION_SCALE) 반영 — 사이클 시간 배수 2^cycle은 누적부에서 별도 적용.
  const d = new Array(CYCLE_LEN)
    .fill(0)
    .map((_, l) => Math.round(baseAttemptDurationMs(l) * ATTEMPT_DURATION_SCALE));

  // D(ℓ) = ℓ→ℓ+1 평균 시간. 안전구간(down=0)도 up<100%면 hold 재시도가 필요 → ÷up.
  // 위험구간은 hold+down 재시도까지 (d + down·D[ℓ-1])/up (하락 시 ℓ-1로 후퇴 비용 포함).
  const D: number[] = new Array(CYCLE_LEN).fill(0);
  D[51] = d[51]! / up[51]!;
  for (let l = 52; l <= 98; l++) {
    D[l] = (d[l]! + down[l]! * D[l - 1]!) / up[l]!;
  }

  // T(ℓ) — ℓ 52..99
  const T: number[] = new Array(CYCLE_LEN + 1).fill(0); // T[99]=0, T[100]=0 (미사용)
  for (let l = 98; l >= 52; l--) T[l] = D[l]! + T[l + 1]!;
  // 안전구간(ℓ≤51): hold 재시도 반영 — 기대 시도수 1/up (ℓ≤9는 up=1이라 d 그대로).
  for (let l = 51; l >= 0; l--) T[l] = d[l]! / up[l]! + T[l + 1]!;

  return { up, down, d, D, T };
}

function fmt(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '—';
  const hours = ms / 3_600_000;
  const days = ms / 86_400_000;
  if (days >= 1) return `${days.toFixed(2)}d (${hours.toFixed(0)}h)`;
  if (hours >= 1) return `${hours.toFixed(2)}h`;
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(0)}m`;
  return `${(ms / 1000).toFixed(0)}s`;
}

type CycleSummary = {
  cycle: number;
  timeMultiplier: number;
  reachToLast99Ms: number; // 누적: 0 → (100c + 99)
  perCycle99Ms: number; // 이 사이클의 0→99 평균 시간 (T_0(0) × 2^c)
};

function main() {
  const cz = computeCycleZero();
  const t0_99 = cz.T[0]!;
  const t0_30 = cz.T[0]! - cz.T[30]!;
  const t0_50 = cz.T[0]! - cz.T[50]!;

  console.log('=== 사이클 0 단계별 평균 시간 (full-wait) ===');
  for (const ℓ of [10, 30, 50, 52, 60, 75, 90, 99]) {
    console.log(
      `+0→+${ℓ.toString().padStart(2)}: ${fmt(cz.T[0]! - cz.T[ℓ]!)}` +
        `  (up=${(cz.up[ℓ]! * 100).toFixed(0)}% down=${(cz.down[ℓ]! * 100).toFixed(0)}% hold=${((1 - cz.up[ℓ]! - cz.down[ℓ]!) * 100).toFixed(0)}%)`,
    );
  }

  console.log('\n=== 사이클별 누적 도달(0→100c+99) ===');
  const cycles: CycleSummary[] = [];
  let cum = 0;
  for (let c = 0; c <= 3; c++) {
    const mult = CYCLE_TIME_BASE ** c;
    const perCycle = t0_99 * mult;
    cum += perCycle;
    cycles.push({
      cycle: c,
      timeMultiplier: mult,
      reachToLast99Ms: cum,
      perCycle99Ms: perCycle,
    });
    console.log(
      `cycle${c} (×${mult}): +${100 * c}→+${100 * c + 99} = ${fmt(perCycle)} / 누적 0→+${100 * c + 99} = ${fmt(cum)}`,
    );
  }

  console.log('\n=== 검증 (BALANCE §1.1 앵커) ===');
  // 코드의 설계 앵커(CUMULATIVE_REACH_ANCHORS_MS, BALANCE §1.1)와 직접 대조 — 박제값 stale 방지.
  const target30 = CUMULATIVE_REACH_ANCHORS_MS[30];
  const target50 = CUMULATIVE_REACH_ANCHORS_MS[50];
  const target99 = CUMULATIVE_REACH_ANCHORS_MS[99];
  console.log(`+30 목표 ${fmt(target30)} / 실제 ${fmt(t0_30)} → ${(t0_30 / target30).toFixed(2)}×`);
  console.log(`+50 목표 ${fmt(target50)} / 실제 ${fmt(t0_50)} → ${(t0_50 / target50).toFixed(2)}×`);
  console.log(`+99 목표 ${fmt(target99)} / 실제 ${fmt(t0_99)} → ${(t0_99 / target99).toFixed(2)}×`);

  // /balance-review 페이지 호환 형식. 해석적 평균이라 percentile은 mean으로 채움(분산 0).
  const targets = cycles.map((c) => 100 * c.cycle + 99);
  const segments = cycles.map((c) => ({
    target: 100 * c.cycle + 99,
    trials: 0, // analytic — N/A
    meanMs: c.reachToLast99Ms,
    p25Ms: c.reachToLast99Ms,
    p50Ms: c.reachToLast99Ms,
    p75Ms: c.reachToLast99Ms,
    p95Ms: c.reachToLast99Ms,
    meanAttempts: 0,
  }));
  const cumulativeAnchors: Record<string, number> = {
    '30': Math.round(t0_30),
    '50': Math.round(t0_50),
    '99': Math.round(t0_99),
    '199': cycles[1]?.reachToLast99Ms ?? 0,
    '299': cycles[2]?.reachToLast99Ms ?? 0,
  };

  const out = {
    generatedAt: new Date().toISOString(),
    mode: 'analytic-expected-value',
    trialsPerTarget: 0,
    targets,
    segments,
    cumulativeAnchors,
    perCycleMeanMs: cycles.map((c) => c.perCycle99Ms),
    cycle0: {
      timeToReachByLevel: Object.fromEntries(
        [0, 10, 20, 30, 40, 50, 51, 52, 60, 70, 75, 80, 90, 95, 99].map((ℓ) => [
          ℓ,
          Math.round(cz.T[0]! - cz.T[ℓ]!),
        ]),
      ),
      perLevelAttemptMs: Object.fromEntries(
        [0, 10, 30, 51, 52, 60, 75, 90, 99].map((ℓ) => [ℓ, cz.d[ℓ]!]),
      ),
      probsPct: Object.fromEntries(
        [0, 10, 30, 51, 52, 60, 75, 90, 99].map((ℓ) => [
          ℓ,
          {
            success: Math.round(cz.up[ℓ]! * 10000),
            down: Math.round(cz.down[ℓ]! * 10000),
            hold: 10000 - Math.round(cz.up[ℓ]! * 10000) - Math.round(cz.down[ℓ]! * 10000),
          },
        ]),
      ),
    },
    cycles,
    anchorTargetsMs: { 30: target30, 50: target50, 99: target99 },
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolvePath(here, '../public/simulation/enhance.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  console.log(`\n저장: ${outPath}`);
}

main();
