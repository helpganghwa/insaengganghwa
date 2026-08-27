// 파견 기대값 시뮬레이션(EXPEDITION §3.3) — 순수 상수 계산, DB 불필요.
//   bun run scripts/sim-expedition.ts [--as 0,300,666,1000,1500,2000] [--level 0,30] [--syn 0,1500,3000]
// 변수: 아바타 강화 합(AS) × 파견 레벨 × 지역 시너지(bp). 출력: 유닛당·하루 기대 💎/📦.
// 하루 유닛 = Lv0: 1슬롯·일 2.5회·Lv0 난이도 분포 / Lv30+: 3슬롯·24h 원정 ×3(=10.2유닛, 일 최대).
import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_DURATION_SCALE,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_SLOTS,
  expeditionAsBonusBp,
  expeditionDifficultyDist,
  type ExpeditionDurationH,
} from '../lib/game/balance';
import { levelBonusBp } from '../lib/game/expedition/engine';

function arg(name: string, def: number[]): number[] {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]!.split(',').map(Number) : def;
}
const AS_LIST = arg('as', [0, 100, 300, 666, 1000, 1500, 2000, 3000]);
const LEVELS = arg('level', [0, 30]);
const SYNS = arg('syn', [0, 1500, 3000]);

const A = EXPEDITION_BASE_AMOUNTS;
const P = EXPEDITION_MAIN_ROLL_BP;
const evDia = (P.diamondOnly / 1e4) * ((A.diamondOnly.diaMin + A.diamondOnly.diaMax) / 2) + (P.both / 1e4) * ((A.both.diaMin + A.both.diaMax) / 2);
const evBox = (P.boxOnly / 1e4) * ((A.boxOnly.boxMin + A.boxOnly.boxMax) / 2) + (P.both / 1e4) * ((A.both.boxMin + A.both.boxMax) / 2);
const crit = 1 + (EXPEDITION_CRIT_BP / 1e4) * (EXPEDITION_CRIT_MULT - 1);
const evScale = (lv: number) => {
  const d = expeditionDifficultyDist(lv);
  return (Object.keys(d) as (keyof typeof d)[]).reduce(
    (a, k) => a + (d[k] / 1e4) * EXPEDITION_DURATION_SCALE[EXPEDITION_DIFFICULTY_HOURS[k] as ExpeditionDurationH],
    0,
  );
};
/** 하루 유닛 — 레벨별 현실적 플레이 가정. */
const dailyUnits = (lv: number) => (lv >= 15 ? EXPEDITION_SLOTS * EXPEDITION_DURATION_SCALE[24] : evScale(lv) * 2.5);

console.log(`유닛당(8h 기준) 기대: 💎${evDia.toFixed(1)} 📦${evBox.toFixed(2)} · 대성공 ×${crit} · 기본 수량 ${JSON.stringify(A)}`);
console.log(`하루 유닛: Lv0 ${dailyUnits(0).toFixed(2)}(1슬롯·2.5회) / Lv30 ${dailyUnits(30).toFixed(1)}(3슬롯·24h×3)\n`);
const head = ['AS', 'M(AS)', ...LEVELS.flatMap((lv) => SYNS.map((s) => `Lv${lv}·시너지${s / 100}%`))];
console.log(head.map((h, i) => (i < 2 ? h.padEnd(6) : h.padStart(16))).join(' '));
for (const as of AS_LIST) {
  const m = 1 + expeditionAsBonusBp(as) / 1e4;
  const cells = LEVELS.flatMap((lv) =>
    SYNS.map((s) => {
      const total = 1 + (levelBonusBp(lv) + s + expeditionAsBonusBp(as)) / 1e4;
      const u = dailyUnits(lv);
      return `💎${Math.round(evDia * crit * u * total)}·📦${Math.round(evBox * crit * u * total)}`;
    }),
  );
  console.log([String(as).padEnd(6), `×${m.toFixed(2)}`.padEnd(6), ...cells.map((c) => c.padStart(16))].join(' '));
}
