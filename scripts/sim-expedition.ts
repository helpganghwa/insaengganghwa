// 파견 기대값 시뮬레이션(EXPEDITION §3.3) — 순수 상수 계산, DB 불필요.
//   bun run scripts/sim-expedition.ts [--as …] [--w 1,1.15,1.3] [--slots 1,2,3,4] [--sum 0,3000,9000]
//   --w: 시너지 가중(장비 3종 동일 가정: 1=불일치, 1.15=일반, 1.3=지역 일치) — AS×w가 M()에 들어간다.
//   --sum: 계정 합산 강화(대성공 가산 1,000당 +1%p, 상한 +20%p).
// 하루 유닛 = 슬롯 수 × 1회(단일 8h, 슬롯당 하루 1회). 변수: 아바타 강화 합(AS) × 지역 시너지 × 합산 강화.
import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_SLOT_UNLOCKS,
  expeditionAsBonusBp,
  expeditionCritBp,
} from '../lib/game/balance';

function arg(name: string, def: number[]): number[] {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]!.split(',').map(Number) : def;
}
const AS_LIST = arg('as', [0, 100, 300, 666, 1000, 1500, 2000, 3000]);
const WS = arg('w', [1, 1.15, 1.3]);
const SLOTS = arg('slots', [1, 2, 3, 4]);
const SUMS = arg('sum', [0, 9000]);

const A = EXPEDITION_BASE_AMOUNTS;
const P = EXPEDITION_MAIN_ROLL_BP;
const evDia = (P.diamondOnly / 1e4) * ((A.diamondOnly.diaMin + A.diamondOnly.diaMax) / 2) + (P.both / 1e4) * ((A.both.diaMin + A.both.diaMax) / 2);
const evBox = (P.boxOnly / 1e4) * ((A.boxOnly.boxMin + A.boxOnly.boxMax) / 2) + (P.both / 1e4) * ((A.both.boxMin + A.both.boxMax) / 2);
const critOf = (sum: number) => 1 + (expeditionCritBp(sum) / 1e4) * (EXPEDITION_CRIT_MULT - 1);

console.log(`1회분 기대: 💎${evDia.toFixed(1)} 📦${evBox.toFixed(2)} · 대성공 ×${critOf(0)}(무강화)~×${critOf(20000)}(합산 20k) · 기본 수량 ${JSON.stringify(A)}`);
console.log(`슬롯 해금(합산 강화): ${EXPEDITION_SLOT_UNLOCKS.map((u) => `슬롯${u.slot}=${u.enhanceSum.toLocaleString('ko-KR')}`).join(' · ')}`);
console.log(`하루 유닛 = 슬롯 수 × 1회(단일 8h)\n`);
const head = ['AS', 'M(AS)', ...SUMS.flatMap((s) => WS.map((w) => `합산${s / 1000}k·가중×${w}`))];
for (const slots of SLOTS) {
  const unlock = EXPEDITION_SLOT_UNLOCKS.find((u) => u.slot === slots);
  console.log(`\n■ 슬롯 ${slots}칸 풀가동(합산 강화 ≥ ${unlock ? unlock.enhanceSum.toLocaleString('ko-KR') : '?'}) — 하루 기대 💎·📦`);
  console.log(head.map((h, i) => (i < 2 ? h.padEnd(6) : h.padStart(16))).join(' '));
  for (const as of AS_LIST) {
    const m = 1 + expeditionAsBonusBp(as) / 1e4;
    const cells = SUMS.flatMap((sum) =>
      WS.map((w) => {
        const total = 1 + expeditionAsBonusBp(Math.round(as * w)) / 1e4; // 시너지 = AS 가중
        return `💎${Math.round(evDia * critOf(sum) * slots * total)}·📦${Math.round(evBox * critOf(sum) * slots * total)}`;
      }),
    );
    console.log([String(as).padEnd(6), `×${m.toFixed(2)}`.padEnd(6), ...cells.map((c) => c.padStart(16))].join(' '));
  }
}
