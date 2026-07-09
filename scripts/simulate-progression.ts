/**
 * 과금대별 진행도 시뮬 — 무과금/중과금/핵과금이 1주·1달·반년에 도달하는
 * 최고강화 레벨 · 초월 · 총 전투력 비교. (해석적, 초 안에 끝남)
 *
 * 모델(가정 명시):
 *  - 강화: 3슬롯을 항상 가동(적극적 플레이). 슬롯당 시도시간 예산(분) =
 *      경과일×1440(실시간 대기, 무료) + 총💎/3(1💎=1분 단축).
 *    도달 레벨 = reach(L) ≤ 예산 을 만족하는 최대 L.
 *    reach(L)은 3분기(성공/유지/하락) 1차 통과시간 해석해(사이클 2^c 기하증가 반영).
 *  - 초월: 박스=무료 faucet(전 과금 동일 55/일 가정 — 박스는 흔해 💎는 강화가 최적).
 *      슬롯당 박스/카탈로그(36종) = 특정 아이템 중복수 → T(T+1)/2 역산.
 *  - 💎는 전액 강화 단축에 사용(고전값 대비 최적). ₩→💎 블렌드 단가 ₩4.5/💎.
 *  - CP = 3 × pieceCombatPower(L, T).
 *
 * ⚠ 가정 민감: 과금액·"슬롯 상시가동"이 결과를 좌우. 캐주얼 무과금은 더 뒤처짐.
 */

import {
  baseSuccessRateBp,
  downRateBp,
  enhanceDurationMs,
  pieceCombatPower,
  transcendFodderCumulative,
} from '../lib/game/balance';

// ── 가정값(조정 가능) ──────────────────────────────────────────────
const FAUCET_GEM_PER_DAY = 700; // 출석~300 + 일일메일 300 + 대난투~100
const FAUCET_BOX_PER_DAY = 55; // 출석7.5+메일15+무료상점12+대난투8+레이드~15
const KRW_PER_GEM = 4.5; // 💎팩 블렌드 단가(₩4.25~5)
const CATALOG_PER_SLOT = 36; // 108 카탈로그 / 3 슬롯

const PROFILES = [
  { key: '무과금', krwPerMonth: 0 },
  { key: '중과금', krwPerMonth: 50_000 },
  { key: '핵과금', krwPerMonth: 1_000_000 },
];
const HORIZONS = [
  { label: '1주', days: 7 },
  { label: '1달', days: 30 },
  { label: '반년', days: 180 },
];
const MAX_LEVEL = 800;

// ── reach(L): +0→L 누적 시도시간(분), 해석적 1차 통과 ────────────────
function buildReach(maxLevel: number): number[] {
  const reach = new Array<number>(maxLevel + 1);
  reach[0] = 0;
  let ePrev = 0; // e(ℓ-1)
  for (let l = 0; l < maxLevel; l++) {
    const d = enhanceDurationMs(l) / 60_000; // 분 (scale·2^cycle 포함)
    const pUp = baseSuccessRateBp(l) / 10000;
    const pDown = downRateBp(l) / 10000;
    // e(ℓ)=ℓ→ℓ+1 기대 시도시간. 하락 없으면 d/pUp, 있으면 (d+pDown·e(ℓ-1))/pUp.
    const e = pDown === 0 ? d / pUp : (d + pDown * ePrev) / pUp;
    ePrev = e;
    reach[l + 1] = reach[l]! + e;
  }
  return reach;
}

function levelForBudget(reach: number[], budgetMin: number): number {
  // reach 오름차순 → 이진탐색
  let lo = 0;
  let hi = reach.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (reach[mid]! <= budgetMin) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function transcendForDupes(dupes: number): number {
  let t = 0;
  while (transcendFodderCumulative(t + 1) <= dupes) t++;
  return t;
}

function fmtCP(n: number): string {
  return n.toLocaleString('en-US');
}

function main() {
  const reach = buildReach(MAX_LEVEL);

  for (const h of HORIZONS) {
    console.log(`\n══════════ ${h.label} (${h.days}일) ══════════`);
    console.log('과금     | 최고강화 |  초월  |    총 전투력    | vs무과금');
    console.log('---------|----------|--------|-----------------|--------');
    // 초월(박스=faucet 동일) — 전 과금 공통
    const boxesPerSlot = (FAUCET_BOX_PER_DAY * h.days) / 3;
    const dupes = boxesPerSlot / CATALOG_PER_SLOT;
    const T = transcendForDupes(dupes);

    let baseCP = 0;
    for (const p of PROFILES) {
      const iapGem = (p.krwPerMonth / KRW_PER_GEM) * (h.days / 30);
      const totalGem = FAUCET_GEM_PER_DAY * h.days + iapGem;
      const budgetMin = h.days * 1440 + totalGem / 3; // 슬롯당(분)
      const L = levelForBudget(reach, budgetMin);
      const cp = 3 * pieceCombatPower(L, T);
      if (p.key === '무과금') baseCP = cp;
      const ratio = baseCP > 0 ? (cp / baseCP).toFixed(2) + '×' : '-';
      console.log(
        `${p.key.padEnd(8)} |   +${String(L).padStart(4)}  |  T${String(T).padStart(2)}  | ${fmtCP(cp).padStart(15)} | ${ratio}`,
      );
    }
  }

  console.log(
    `\n가정: 무과금 faucet ${FAUCET_GEM_PER_DAY}💎·${FAUCET_BOX_PER_DAY}박스/일, 중과금 ₩50k/월, 핵과금 ₩100만/월, ₩${KRW_PER_GEM}/💎, 3슬롯 상시가동.`,
  );
}

main();
