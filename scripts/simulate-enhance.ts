/**
 * 강화 시뮬레이션 — full-wait Monte Carlo(분산·percentile 확인용).
 *
 * **평균값은 `scripts/analyze-enhance.ts`(해석적 expected first-passage time)가 millisecond
 * 안에 정확히 산출**하므로, 이 스크립트는 분산·p25/p50/p95 확인 또는 회귀 검증용으로만
 * 사용한다. 사이클 2(×4) 이상은 시뮬당 수십만 시도가 필요해 매우 느림 — 보통 +99까지만.
 *
 * 사용:
 *   bun run scripts/simulate-enhance.ts            # 기본 N=2000, 목표 [99]
 *   bun run scripts/simulate-enhance.ts --n 500 --targets 99,199
 *
 * 각 시도:
 *   - duration = enhanceDurationMs(L)
 *   - success = baseSuccessRateBp(L) / 10000          ← full-wait 가정
 *   - down    = downRateBp(L) / 10000                 ← 고정
 *   - hold    = 1 - success - down
 *   - roll: 누적 cdf 비교 → success(L+1) / down(levelAfterFail) / hold(L 유지)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baseSuccessRateBp,
  downRateBp,
  enhanceDurationMs,
  levelAfterFail,
} from '../lib/game/balance';

type SegmentStats = {
  target: number;
  trials: number;
  /** ms */
  meanMs: number;
  p25Ms: number;
  p50Ms: number;
  p75Ms: number;
  p95Ms: number;
  meanAttempts: number;
};

type SimulationOutput = {
  generatedAt: string;
  trialsPerTarget: number;
  targets: number[];
  segments: SegmentStats[];
  /** 누적 도달 시간 앵커(시뮬에서 측정한 평균) — 검증용. */
  cumulativeAnchors: Record<number, number>;
  /** 사이클별 평균 (target = 99/199/299에서 직전 사이클 대비 차이). */
  perCycleMeanMs: number[];
};

function parseArgs(): { n: number; targets: number[] } {
  const args = process.argv.slice(2);
  let n = 2000;
  let targets = [99];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--n' && args[i + 1]) {
      n = Math.max(1, Math.floor(Number(args[i + 1])));
      i++;
    } else if (args[i] === '--targets' && args[i + 1]) {
      targets = args[i + 1]!
        .split(',')
        .map((s) => Math.floor(Number(s.trim())))
        .filter((v) => Number.isFinite(v) && v > 0);
      i++;
    }
  }
  return { n, targets };
}

/** Mulberry32 — 시드 가능한 PRNG. 시뮬 재현성. crypto는 시뮬엔 과잉. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * +0에서 시작 → target 도달까지 1회 trial.
 * 반환: { ms, attempts, intermediateMs: target 별 도달 시점 }.
 */
function runTrial(maxTarget: number, anchors: number[], rng: () => number) {
  let level = 0;
  let ms = 0;
  let attempts = 0;
  const intermediate = new Map<number, number>();

  while (level < maxTarget) {
    const dur = enhanceDurationMs(level);
    const baseBp = baseSuccessRateBp(level);
    const downBp = downRateBp(level);
    ms += dur;
    attempts++;

    const r = Math.floor(rng() * 10000);
    if (r < baseBp) {
      level += 1;
      // 앵커 첫 도달 기록
      for (const a of anchors) {
        if (level === a && !intermediate.has(a)) intermediate.set(a, ms);
      }
    } else if (r < baseBp + downBp) {
      level = levelAfterFail(level);
    }
    // else: hold (level 그대로)
  }

  // maxTarget도 앵커에 포함되었으면 기록
  if (anchors.includes(maxTarget) && !intermediate.has(maxTarget)) {
    intermediate.set(maxTarget, ms);
  }
  return { ms, attempts, intermediate };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((p / 100) * sortedAsc.length)));
  return sortedAsc[idx]!;
}

function summarize(target: number, mss: number[], attempts: number[]): SegmentStats {
  const sorted = [...mss].sort((a, b) => a - b);
  const mean = mss.reduce((s, v) => s + v, 0) / mss.length;
  const meanAttempts = attempts.reduce((s, v) => s + v, 0) / attempts.length;
  return {
    target,
    trials: mss.length,
    meanMs: Math.round(mean),
    p25Ms: Math.round(percentile(sorted, 25)),
    p50Ms: Math.round(percentile(sorted, 50)),
    p75Ms: Math.round(percentile(sorted, 75)),
    p95Ms: Math.round(percentile(sorted, 95)),
    meanAttempts: Math.round(meanAttempts),
  };
}

async function main() {
  const { n, targets } = parseArgs();
  const maxTarget = Math.max(...targets);
  const anchors = [30, 50, ...targets];

  console.log(`[sim] trials=${n}, targets=${targets.join(',')}, anchor=${anchors.join(',')}`);
  const t0 = Date.now();

  // target별 reach 시간 배열
  const reachMs: Record<number, number[]> = {};
  const reachAttempts: Record<number, number[]> = {};
  for (const t of targets) {
    reachMs[t] = [];
    reachAttempts[t] = [];
  }
  const anchorSums: Record<number, { sum: number; count: number }> = {};
  for (const a of anchors) anchorSums[a] = { sum: 0, count: 0 };

  for (let i = 0; i < n; i++) {
    const rng = mulberry32(0xdeadbeef ^ (i + 1));
    const { ms, attempts, intermediate } = runTrial(maxTarget, anchors, rng);

    // 시뮬 끝에서: 모든 target은 intermediate에 기록되어 있어야 함(maxTarget는 최종 도달).
    for (const t of targets) {
      const reached = intermediate.get(t);
      if (reached !== undefined) {
        reachMs[t]!.push(reached);
        // attempts는 maxTarget 도달 시점 전체. 중간 target까지의 attempts는 측정 X — ms만 핵심
        reachAttempts[t]!.push(attempts);
      } else if (t === maxTarget) {
        reachMs[t]!.push(ms);
        reachAttempts[t]!.push(attempts);
      }
    }
    for (const a of anchors) {
      const reached = intermediate.get(a);
      if (reached !== undefined) {
        anchorSums[a]!.sum += reached;
        anchorSums[a]!.count += 1;
      }
    }

    if ((i + 1) % Math.max(1, Math.floor(n / 10)) === 0) {
      console.log(`[sim] ${i + 1}/${n} done (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }

  const segments: SegmentStats[] = targets.map((t) =>
    summarize(t, reachMs[t]!, reachAttempts[t]!),
  );
  const cumulativeAnchors: Record<number, number> = {};
  for (const a of anchors) {
    const s = anchorSums[a]!;
    cumulativeAnchors[a] = s.count > 0 ? Math.round(s.sum / s.count) : 0;
  }

  // 사이클별 평균 = 인접 target 사이의 차이.
  const perCycleMeanMs: number[] = [];
  let prev = 0;
  for (const seg of segments) {
    perCycleMeanMs.push(seg.meanMs - prev);
    prev = seg.meanMs;
  }

  const out: SimulationOutput = {
    generatedAt: new Date().toISOString(),
    trialsPerTarget: n,
    targets,
    segments,
    cumulativeAnchors,
    perCycleMeanMs,
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolvePath(here, '../public/simulation/enhance.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  const fmt = (ms: number) => `${(ms / 86_400_000).toFixed(2)}d`;
  console.log('\n=== 결과 (full-wait) ===');
  console.log(`+30 평균 도달: ${fmt(cumulativeAnchors[30] ?? 0)}  (목표 1d)`);
  console.log(`+50 평균 도달: ${fmt(cumulativeAnchors[50] ?? 0)}  (목표 3d)`);
  for (const seg of segments) {
    console.log(
      `+${seg.target} 평균: ${fmt(seg.meanMs)}, p50 ${fmt(seg.p50Ms)}, p95 ${fmt(seg.p95Ms)}, 시도수 ~${seg.meanAttempts}`,
    );
  }
  console.log(`\n저장: ${outPath}`);
  console.log(`소요: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
