/**
 * 레이드 박스 처리량 시뮬 — 페이즈 보상 개편안 수치 결정용.
 *
 * 개편안(토론 결론):
 *   - 개설비 1,000 → 500 다이아
 *   - 페이즈 보상에서 다이아 삭제 → 돌파 페이즈마다 **보급 상자만** 지급
 *   - 페이즈당 박스 개수: 1개 고정 vs 1~3개 랜덤(avg 2) → 본 시뮬로 결정
 *
 * 비교 기준선(무과금 패시브 박스 공급):
 *   - 일일 보급 메일 15박스/일 → 450/월
 *   - 출석 캘린더 210박스/28일 → ~225/월
 *   - 합계 ≈ 675박스/월  (BALANCE §7.2 / §6.4)
 *
 * 핵심 질문: 레이드가 초월 병목(특정 아이템 55개)을 *보조*하되 *지배*하지 않는
 *           박스 개수는 1개냐 1~3개냐. 패시브 대비 배수로 판단.
 *
 * 사용: bun run scripts/simulate-raid-boxes.ts [--n 20000]
 */
import {
  RAID_BASE_ATTACKS,
  RAID_DAILY_CAP,
  RAID_CRIT_RATE_BP,
  RAID_PHASE1_HP_MIN,
  RAID_PHASE1_HP_MAX,
  computeRaidDamage,
} from '../lib/game/balance';
import { raidPhasesCleared } from '../lib/game/raid/drops';

const PASSIVE_BOXES_PER_MONTH = 675; // 일일보급 450 + 출석 225

// 대표 전투력 티어 (§3.1 P(L)=10·(1+L)^1.5 기반 현실 추정)
const TIERS: { name: string; cp: number }[] = [
  { name: '뉴비   (총CP ~1.5k)', cp: 1_500 },
  { name: '초중반 (총CP ~5k)', cp: 5_000 },
  { name: '중반   (총CP ~10k)', cp: 10_000 },
  { name: '헤비   (총CP ~30k)', cp: 30_000 },
  { name: '고래   (총CP ~100k)', cp: 100_000 },
];

// 참여 인원 시나리오 (전원 동일 티어 가정 — 보상은 전원 동일이므로 인당 박스는 인원·합산피해에 의존)
const PARTY_SIZES = [1, 3, 5, 10];

function argN(): number {
  const i = process.argv.indexOf('--n');
  return i >= 0 ? Number(process.argv[i + 1]) : 20_000;
}

function rand(): number {
  return Math.random();
}

/** 1회 레이드의 돌파 페이즈 수(인당 base 10공격, 추가공격 없음 가정). */
function simulateRaidPhases(cp: number, party: number): number {
  const phase1Hp =
    RAID_PHASE1_HP_MIN + rand() * (RAID_PHASE1_HP_MAX - RAID_PHASE1_HP_MIN);
  let total = 0;
  for (let p = 0; p < party; p++) {
    for (let a = 0; a < RAID_BASE_ATTACKS; a++) {
      const varFactor = 0.7 + rand() * 0.6; // U(0.7,1.3)
      const isCrit = rand() * 10_000 < RAID_CRIT_RATE_BP;
      total += computeRaidDamage(cp, varFactor, isCrit);
    }
  }
  return raidPhasesCleared(phase1Hp, total);
}

function pct(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

function main() {
  const N = argN();
  console.log(`\n레이드 박스 처리량 시뮬 (N=${N}/셀, base ${RAID_BASE_ATTACKS}공격, 추가공격 0)`);
  console.log(`패시브 기준선: ${PASSIVE_BOXES_PER_MONTH} 박스/월 · 일일 레이드 한도 ${RAID_DAILY_CAP}회\n`);

  for (const tier of TIERS) {
    console.log(`■ ${tier.name}`);
    console.log(
      '  인원 | 페이즈(mean/p50/p95) | 인당박스/레이드 [1개 / 1~3개] | 일일한도×5 월환산 [1개 / 1~3개] (패시브배수)',
    );
    for (const party of PARTY_SIZES) {
      const phasesArr: number[] = [];
      for (let i = 0; i < N; i++) phasesArr.push(simulateRaidPhases(tier.cp, party));
      const mean = phasesArr.reduce((a, b) => a + b, 0) / N;

      // 1개 고정: 인당박스 = 페이즈수. 1~3개(avg 2): 페이즈수 × 2.
      const boxes1 = mean;
      const boxes13 = mean * 2;
      // 일일 5회 × 30일 월환산 (풀 참여 가정 — 상한 시나리오)
      const month1 = boxes1 * RAID_DAILY_CAP * 30;
      const month13 = boxes13 * RAID_DAILY_CAP * 30;
      const mult1 = month1 / PASSIVE_BOXES_PER_MONTH;
      const mult13 = month13 / PASSIVE_BOXES_PER_MONTH;

      console.log(
        `  ${String(party).padStart(2)}명 | ${mean.toFixed(1).padStart(5)}/${String(pct(phasesArr, 0.5)).padStart(2)}/${String(pct(phasesArr, 0.95)).padStart(2)}            | ${boxes1.toFixed(1).padStart(5)} / ${boxes13.toFixed(1).padStart(5)}              | ${Math.round(month1).toString().padStart(5)} / ${Math.round(month13).toString().padStart(5)}  (×${mult1.toFixed(1)} / ×${mult13.toFixed(1)})`,
      );
    }
    console.log('');
  }
}

main();
