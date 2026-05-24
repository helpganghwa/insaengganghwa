/**
 * 곡선 후보 — 고레벨 success 상향 + 하락 독립.
 */

import { baseAttemptDurationMs, CYCLE_LEN } from '../lib/game/balance';

const TARGET_99_MS = 14 * 24 * 3600_000;

function lerp(anchors: Array<readonly [number, number]>, x: number): number {
  if (x <= anchors[0]![0]) return anchors[0]![1];
  if (x >= anchors[anchors.length - 1]![0]) return anchors[anchors.length - 1]![1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i]!;
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1]!;
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return anchors[anchors.length - 1]![1];
}

function computeT99(
  upAnchors: Array<readonly [number, number]>,
  downAnchors: Array<readonly [number, number]>,
): { T99: number; T30: number; T50: number } {
  const up: number[] = [];
  const down: number[] = [];
  const d: number[] = [];
  for (let l = 0; l < CYCLE_LEN; l++) {
    up.push(l <= 9 ? 1.0 : lerp(upAnchors, l) / 10000);
    down.push(l <= 51 ? 0 : lerp(downAnchors, l) / 10000);
    d.push(baseAttemptDurationMs(l));
  }
  for (let l = 0; l < CYCLE_LEN; l++) {
    if (up[l]! + down[l]! > 1.0001) return { T99: Infinity, T30: 0, T50: 0 };
  }
  const D: number[] = new Array(CYCLE_LEN).fill(0);
  D[51] = d[51]!;
  for (let l = 52; l <= 98; l++) D[l] = (d[l]! + down[l]! * D[l - 1]!) / up[l]!;
  const T: number[] = new Array(CYCLE_LEN + 1).fill(0);
  for (let l = 98; l >= 52; l--) T[l] = D[l]! + T[l + 1]!;
  T[51] = d[51]! + T[52]!;
  for (let l = 50; l >= 0; l--) T[l] = d[l]! + T[l + 1]!;
  return { T99: T[0]!, T30: T[0]! - T[30]!, T50: T[0]! - T[50]! };
}

function fmt(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  const d = ms / 86_400_000;
  if (d >= 1) return `${d.toFixed(2)}d`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

console.log(`목표 +99 ≈ ${fmt(TARGET_99_MS)}\n`);

// 후보 1: 사용자 안 — high-level success ↑, down 독립
const candidates: Array<{
  name: string;
  up: Array<readonly [number, number]>;
  down: Array<readonly [number, number]>;
}> = [
  {
    name: 'C1: up +99=25%, +90=30%, +75=40% / down +99=15%, +52=8%',
    up: [
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
    ],
    down: [
      [52, 800],
      [60, 1200],
      [75, 1500],
      [90, 1500],
      [99, 1500],
    ],
  },
  {
    name: 'C2: up +99=25%, +90=30% / down +99=20%, +52=10%',
    up: [
      [10, 10000],
      [20, 8500],
      [30, 7000],
      [40, 5800],
      [51, 5000],
      [52, 4800],
      [60, 4200],
      [75, 3500],
      [90, 3000],
      [99, 2500],
    ],
    down: [
      [52, 1000],
      [60, 1500],
      [75, 1800],
      [90, 2000],
      [99, 2000],
    ],
  },
  {
    name: 'C3: up +99=20%, +90=25% / down +99=12%, +52=6%',
    up: [
      [10, 10000],
      [20, 8500],
      [30, 7000],
      [40, 5800],
      [51, 5000],
      [52, 4800],
      [60, 4000],
      [75, 3200],
      [90, 2500],
      [99, 2000],
    ],
    down: [
      [52, 600],
      [60, 900],
      [75, 1100],
      [90, 1200],
      [99, 1200],
    ],
  },
  {
    name: 'C4: up +99=30%, +90=35% / down +99=20%, +52=10%',
    up: [
      [10, 10000],
      [20, 8500],
      [30, 7000],
      [40, 5800],
      [51, 5000],
      [52, 4800],
      [60, 4500],
      [75, 4000],
      [90, 3500],
      [99, 3000],
    ],
    down: [
      [52, 1000],
      [60, 1500],
      [75, 1800],
      [90, 2000],
      [99, 2000],
    ],
  },
];

for (const c of candidates) {
  const r = computeT99(c.up, c.down);
  console.log(`\n${c.name}`);
  console.log(`  +30=${fmt(r.T30)} (목표 1d)  +50=${fmt(r.T50)} (목표 3d)  +99=${fmt(r.T99)} (목표 14d)`);
  // 단계별 확률 표
  for (const lv of [52, 60, 75, 90, 99]) {
    const u = lerp(c.up, lv);
    const dn = lerp(c.down, lv);
    console.log(
      `   ℓ=${lv.toString().padStart(2)}: up=${(u / 100).toFixed(1)}% down=${(dn / 100).toFixed(1)}% hold=${((10000 - u - dn) / 100).toFixed(1)}%  drift=${((u - dn) / 100).toFixed(1)}%`,
    );
  }
}
