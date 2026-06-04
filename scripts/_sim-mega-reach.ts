// 메가(+2) 추가 후 0 → +300 도달 시간 시뮬 (10단계마다 도달 시간 표).
// Monte Carlo 1000 runs, 각 run에서 10·20·...·300 도달 시점 기록 → 평균/중간값/p10/p90.
//
// 실행: bun --conditions=react-server run scripts/_sim-mega-reach.ts

import {
  baseSuccessRateBp,
  downRateBp,
  effectiveOutcomeProbsBp,
  enhanceDurationMs,
  levelAfterFail,
} from '../lib/game/balance';

const MAX_LEVEL = 300;
const MILESTONES = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
const RUNS = 1000;

type Outcome = 'mega' | 'success' | 'down' | 'hold';

function step(level: number, rng: () => number): { newLevel: number; durMs: number; oc: Outcome } {
  const baseBp = baseSuccessRateBp(level);
  const downBp = downRateBp(level);
  const dur = enhanceDurationMs(level);
  // full elapsed = total (cron 또는 100% 시점 시도)
  const probs = effectiveOutcomeProbsBp(baseBp, downBp, dur, dur);
  const roll = Math.floor(rng() * 10000);
  if (roll < probs.mega) return { newLevel: level + 2, durMs: dur, oc: 'mega' };
  if (roll < probs.mega + probs.success) return { newLevel: level + 1, durMs: dur, oc: 'success' };
  if (roll < probs.mega + probs.success + probs.down)
    return { newLevel: levelAfterFail(level), durMs: dur, oc: 'down' };
  return { newLevel: level, durMs: dur, oc: 'hold' };
}

function runOnce(rng: () => number): { reached: Map<number, number>; ocCount: Record<Outcome, number> } {
  let level = 0;
  let elapsed = 0;
  const reached = new Map<number, number>();
  const ms = new Set(MILESTONES);
  const ocCount: Record<Outcome, number> = { mega: 0, success: 0, down: 0, hold: 0 };
  let safetyAttempts = 0;
  const SAFETY_MAX = 200_000;
  while (level < MAX_LEVEL) {
    const s = step(level, rng);
    elapsed += s.durMs;
    const prev = level;
    level = s.newLevel;
    ocCount[s.oc]++;
    // 마일스톤(이번 단계에서 처음 도달한 것들) 기록
    for (let lv = prev + 1; lv <= level; lv++) {
      if (ms.has(lv) && !reached.has(lv)) reached.set(lv, elapsed);
    }
    safetyAttempts++;
    if (safetyAttempts > SAFETY_MAX) {
      console.warn('safety break at level', level);
      break;
    }
  }
  return { reached, ocCount };
}

function fmt(ms: number): string {
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

console.log(`▶ Monte Carlo ${RUNS} runs, target=+${MAX_LEVEL}, MEGA_OF_SUCCESS_BP=500 (=5%)\n`);

const allReached = new Map<number, number[]>();
for (const m of MILESTONES) allReached.set(m, []);
const totalOcCount: Record<Outcome, number> = { mega: 0, success: 0, down: 0, hold: 0 };

const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const { reached, ocCount } = runOnce(Math.random);
  for (const m of MILESTONES) {
    const v = reached.get(m);
    if (v !== undefined) allReached.get(m)!.push(v);
  }
  for (const k of ['mega', 'success', 'down', 'hold'] as const) {
    totalOcCount[k] += ocCount[k];
  }
}
const dt = Date.now() - t0;

console.log('| 레벨   | 평균        | 중간값      | p10         | p90         |');
console.log('|--------|-------------|-------------|-------------|-------------|');
for (const m of MILESTONES) {
  const samples = allReached.get(m)!.slice().sort((a, b) => a - b);
  const n = samples.length;
  if (n === 0) {
    console.log(`| +${String(m).padStart(3)}   | —           | —           | —           | —           |`);
    continue;
  }
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const median = samples[Math.floor(n / 2)]!;
  const p10 = samples[Math.floor(n * 0.1)]!;
  const p90 = samples[Math.floor(n * 0.9)]!;
  console.log(
    `| +${String(m).padStart(3)}   | ${fmt(mean).padEnd(11)} | ${fmt(median).padEnd(11)} | ${fmt(p10).padEnd(11)} | ${fmt(p90).padEnd(11)} |`,
  );
}

const totalSteps = Object.values(totalOcCount).reduce((a, b) => a + b, 0);
console.log(`\n총 시도 ${totalSteps.toLocaleString()} 회 (${RUNS} runs, ${(dt / 1000).toFixed(1)}s)`);
console.log(
  `  mega    ${((totalOcCount.mega / totalSteps) * 100).toFixed(2)}% (${totalOcCount.mega.toLocaleString()})`,
);
console.log(
  `  success ${((totalOcCount.success / totalSteps) * 100).toFixed(2)}% (${totalOcCount.success.toLocaleString()})`,
);
console.log(
  `  hold    ${((totalOcCount.hold / totalSteps) * 100).toFixed(2)}% (${totalOcCount.hold.toLocaleString()})`,
);
console.log(
  `  down    ${((totalOcCount.down / totalSteps) * 100).toFixed(2)}% (${totalOcCount.down.toLocaleString()})`,
);
