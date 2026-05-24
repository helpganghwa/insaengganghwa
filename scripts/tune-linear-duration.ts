/**
 * 선형 d(ℓ) 튜닝 — d(ℓ) = a + b × ℓ. 확률은 그대로(C1 채택값), 시간만 조정.
 * +0→+99 평균 도달 시간 = 21일이 되는 (a, b) 후보 탐색.
 */

import { baseSuccessRateBp, downRateBp, CYCLE_LEN } from '../lib/game/balance';

const TARGET_99_MS = 28 * 24 * 3600_000; // 4주
const MIN = 60_000;

function reach99Ms(d: number[]): number {
  const up: number[] = [];
  const down: number[] = [];
  for (let l = 0; l < CYCLE_LEN; l++) {
    up.push(baseSuccessRateBp(l) / 10000);
    down.push(downRateBp(l) / 10000);
  }
  const D: number[] = new Array(CYCLE_LEN).fill(0);
  for (let l = 0; l <= 51; l++) D[l] = d[l]!;
  for (let l = 52; l <= 98; l++) D[l] = (d[l]! + down[l]! * D[l - 1]!) / up[l]!;
  let T99 = 0;
  for (let l = 0; l <= 98; l++) T99 += D[l]!;
  return T99;
}

function linearD(aMs: number, dMaxMs: number): number[] {
  const arr = new Array(CYCLE_LEN).fill(0);
  for (let l = 0; l < CYCLE_LEN; l++) {
    arr[l] = aMs + ((dMaxMs - aMs) * l) / (CYCLE_LEN - 1);
  }
  return arr;
}

/** 주어진 a(min) 고정, T99 = target이 되는 d(99) 이분탐색(분). */
function solveDmax(aMin: number, targetMs: number): number {
  let lo = aMin; // d(99) ≥ d(0)
  let hi = 24 * 60; // 24h 상한
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const t = reach99Ms(linearD(aMin * MIN, mid * MIN));
    if (t < targetMs) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function fmt(ms: number): string {
  const d = ms / 86_400_000;
  if (d >= 1) return `${d.toFixed(2)}d`;
  return `${(ms / 3_600_000).toFixed(2)}h`;
}
function fmtM(min: number): string {
  if (min < 1) return `${(min * 60).toFixed(0)}s`;
  if (min < 60) return `${min.toFixed(1)}m`;
  return `${(min / 60).toFixed(2)}h`;
}

console.log(`목표 T(+0→+99) = ${fmt(TARGET_99_MS)}\n`);
console.log('=== d(ℓ) = a + b × ℓ (선형) — d(0)별 튜닝 ===');
console.log('d(0)\td(99)\t결과 T(99)\t단계 평균(d(50))');
for (const a of [0.25, 0.5, 1, 2, 3, 5, 10]) {
  const dMax = solveDmax(a, TARGET_99_MS);
  if (dMax >= 24 * 60 - 1) {
    console.log(`${fmtM(a)}\t∞(24h 한계 초과)`);
    continue;
  }
  const d = linearD(a * MIN, dMax * MIN);
  const t99 = reach99Ms(d);
  const dMid = (a + dMax) / 2;
  console.log(
    `${fmtM(a).padEnd(6)}\t${fmtM(dMax).padEnd(6)}\t${fmt(t99).padEnd(8)}\t${fmtM(dMid)}`,
  );
}

console.log('\n=== 채택 후보 검증 (d(0) = 10s) ===');
for (const a of [10 / 60]) {
  const dMax = solveDmax(a, TARGET_99_MS);
  const d = linearD(a * MIN, dMax * MIN);
  console.log(`\nd(0)=${fmtM(a)}, d(99)=${fmtM(dMax)}, slope b=${((dMax - a) / 99).toFixed(2)}분/단계`);
  for (const lv of [0, 10, 20, 30, 50, 60, 75, 90, 99]) {
    console.log(`  d(${lv}) = ${fmtM(d[lv]! / MIN)}`);
  }
  console.log(`  T(99) = ${fmt(reach99Ms(d))}`);
}
