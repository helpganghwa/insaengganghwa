// 파견 기대값 시뮬레이션(EXPEDITION §3.3) — 순수 상수 계산, DB 불필요.
//   bun run scripts/sim-expedition.ts [--as …] [--level 0,30] [--w 1,1.15,1.3] [--slots 1,2,3,4]
//   --w: 시너지 가중(장비 3종 동일 가정: 1=불일치, 1.15=일반, 1.3=지역 일치) — AS×w가 M()에 들어간다(2026-08-28).
//   슬롯은 계정 합산 강화로 해금(1k/5k/10k/15k) — 슬롯 수를 변수로 두고 하루 유닛 = 슬롯 × 24h(3.4).
// 변수: 아바타 강화 합(AS) × 파견 레벨 × 지역 시너지(bp). 출력: 유닛당·하루 기대 💎/📦.
// 하루 유닛 = 슬롯 수 × 24h 원정 스케일(3.4)(Lv15+ 원정 상시 선택 가정) / Lv<15: 슬롯 × Lv 난이도 분포 평균 × 2.5회.
import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_DURATION_SCALE,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_SLOT_UNLOCKS,
  expeditionAsBonusBp,
  expeditionCritBp,
  expeditionDifficultyDist,
  type ExpeditionDurationH,
} from '../lib/game/balance';

function arg(name: string, def: number[]): number[] {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]!.split(',').map(Number) : def;
}
const AS_LIST = arg('as', [0, 100, 300, 666, 1000, 1500, 2000, 3000]);
const LEVELS = arg('level', [0, 30]);
const WS = arg('w', [1, 1.15, 1.3]);
const SLOTS = arg('slots', [1, 2, 3, 4]);

const A = EXPEDITION_BASE_AMOUNTS;
const P = EXPEDITION_MAIN_ROLL_BP;
const evDia = (P.diamondOnly / 1e4) * ((A.diamondOnly.diaMin + A.diamondOnly.diaMax) / 2) + (P.both / 1e4) * ((A.both.diaMin + A.both.diaMax) / 2);
const evBox = (P.boxOnly / 1e4) * ((A.boxOnly.boxMin + A.boxOnly.boxMax) / 2) + (P.both / 1e4) * ((A.both.boxMin + A.both.boxMax) / 2);
const critOf = (lv: number) => 1 + (expeditionCritBp(lv) / 1e4) * (EXPEDITION_CRIT_MULT - 1);
const crit = critOf(0);
const evScale = (lv: number) => {
  const d = expeditionDifficultyDist(lv);
  return (Object.keys(d) as (keyof typeof d)[]).reduce(
    (a, k) => a + (d[k] / 1e4) * EXPEDITION_DURATION_SCALE[EXPEDITION_DIFFICULTY_HOURS[k] as ExpeditionDurationH],
    0,
  );
};
/** 하루 유닛 — 슬롯 수 × 레벨별 현실적 플레이 가정. */
const dailyUnits = (lv: number, slots: number) => slots * (lv >= 15 ? EXPEDITION_DURATION_SCALE[24] : evScale(lv) * 2.5);

console.log(`유닛당(8h 기준) 기대: 💎${evDia.toFixed(1)} 📦${evBox.toFixed(2)} · 대성공 ×${crit} · 기본 수량 ${JSON.stringify(A)}`);
console.log(`슬롯 해금(합산 강화): ${EXPEDITION_SLOT_UNLOCKS.map((u) => `슬롯${u.slot}=${u.enhanceSum.toLocaleString('ko-KR')}`).join(' · ')}`);
console.log(`하루 유닛(슬롯당): Lv0 ${dailyUnits(0, 1).toFixed(2)}(2.5회) / Lv30 ${EXPEDITION_DURATION_SCALE[24]}(24h×1)\n`);
const head = ['AS', 'M(AS)', ...LEVELS.flatMap((lv) => WS.map((w) => `Lv${lv}·가중×${w}`))];
for (const slots of SLOTS) {
  const unlock = EXPEDITION_SLOT_UNLOCKS.find((u) => u.slot === slots);
  console.log(`\n■ 슬롯 ${slots}칸 풀가동(합산 강화 ≥ ${unlock ? unlock.enhanceSum.toLocaleString('ko-KR') : '?'}) — 하루 기대 💎·📦`);
  console.log(head.map((h, i) => (i < 2 ? h.padEnd(6) : h.padStart(16))).join(' '));
  for (const as of AS_LIST) {
    const m = 1 + expeditionAsBonusBp(as) / 1e4;
    const cells = LEVELS.flatMap((lv) =>
      WS.map((w) => {
        const total = 1 + expeditionAsBonusBp(Math.round(as * w)) / 1e4; // 시너지=AS 가중, 레벨 배율 없음
        const u = dailyUnits(lv, slots);
        return `💎${Math.round(evDia * critOf(lv) * u * total)}·📦${Math.round(evBox * critOf(lv) * u * total)}`;
      }),
    );
    console.log([String(as).padEnd(6), `×${m.toFixed(2)}`.padEnd(6), ...cells.map((c) => c.padStart(16))].join(' '));
  }
}
