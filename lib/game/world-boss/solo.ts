/**
 * 개인 월드보스(그림자 거미 여왕) 규칙 — 순수 모듈(서버·화면·테스트가 같이 쓴다). 수치는 2026-11-13 사용자 확정.
 *
 * - 도전 1판 = 공격 10번. 공격 1번 = 탑 규칙 전투력 × 0.8~1.2, 치명 10% ×1.5(빗나감엔 없음).
 * - 공격마다 여왕 패턴 하나: 평소 30% · 웅크리기 15%(×0.5) · 무기/방어구/장신구 옭아매기 각 15%(그 부위 전투력 0%)
 *   · 거미줄 타기 5%(빗나감) · 약점 노출 5%(×2).
 * - 효과가 없는 패턴(평소, 전투력 0인 부위를 묶음)은 'none'으로 적는다 — 화면이 이름표를 띄우지 않는다.
 * - 공동 페이즈: n페이즈 체력 = 1,000만 × 1.1^(n-1). 모든 판의 점수가 쌓인다.
 * - 보상: 최고 기록이 닿은 구간 하나(+ 최종 페이즈 × 2%, 상한 60%) + 순위(1~30위, 페이즈 보너스 없음).
 */

export type SoloPattern = 'none' | 'crouch' | 'weapon' | 'armor' | 'accessory' | 'dodge' | 'expose';
export type SoloSlot = 'weapon' | 'armor' | 'accessory';
export type SoloPower = Record<SoloSlot, number>;
export type SoloHit = { p: SoloPattern; d: number; c: boolean };

export const SOLO_HITS_PER_RUN = 10;
/** 하루 무료 도전(KST 날짜마다). 재도전은 포인트로 산다(POINT_EXTRA_PRICES.wb_retry). */
export const SOLO_FREE_RUNS_PER_DAY = 1;
export const SOLO_CRIT_CHANCE = 0.1;
export const SOLO_CRIT_MULT = 1.5;
export const SOLO_SPREAD: readonly [number, number] = [0.8, 1.2];

/** 누적 확률표(합 1). 순서대로 굴린다. */
export const SOLO_PATTERN_TABLE: readonly { p: Exclude<SoloPattern, 'none'> | 'normal'; w: number }[] = [
  { p: 'normal', w: 0.3 },
  { p: 'crouch', w: 0.15 },
  { p: 'weapon', w: 0.15 },
  { p: 'armor', w: 0.15 },
  { p: 'accessory', w: 0.15 },
  { p: 'dodge', w: 0.05 },
  { p: 'expose', w: 0.05 },
];

export const SOLO_PATTERN_LABEL: Record<Exclude<SoloPattern, 'none'>, { name: string; desc: string }> = {
  crouch: { name: '웅크리기', desc: '피해 절반' },
  weapon: { name: '무기 옭아매기', desc: '무기 전투력 0%' },
  armor: { name: '방어구 옭아매기', desc: '방어구 전투력 0%' },
  accessory: { name: '장신구 옭아매기', desc: '장신구 전투력 0%' },
  dodge: { name: '거미줄 타기', desc: '공격 빗나감' },
  expose: { name: '약점 노출', desc: '피해 2배' },
};

/** rand: [0,1) 균등. 서버는 crypto 기반, 테스트는 시드 고정. */
export function rollSoloRun(power: SoloPower, rand: () => number): SoloHit[] {
  const total = power.weapon + power.armor + power.accessory;
  const hits: SoloHit[] = [];
  for (let i = 0; i < SOLO_HITS_PER_RUN; i++) {
    let x = rand();
    let picked: (typeof SOLO_PATTERN_TABLE)[number]['p'] = 'normal';
    for (const row of SOLO_PATTERN_TABLE) {
      if (x < row.w) {
        picked = row.p;
        break;
      }
      x -= row.w;
    }
    let base = total;
    let p: SoloPattern = 'none';
    if (picked === 'crouch') {
      base = total * 0.5;
      p = 'crouch';
    } else if (picked === 'weapon' || picked === 'armor' || picked === 'accessory') {
      // 묶인 부위가 원래 0이면 효과 없음 → 이름표 없이 평소처럼.
      if (power[picked] > 0) {
        base = total - power[picked];
        p = picked;
      }
    } else if (picked === 'dodge') {
      base = 0;
      p = 'dodge';
    } else if (picked === 'expose') {
      base = total * 2;
      p = 'expose';
    }
    if (p === 'dodge') {
      hits.push({ p, d: 0, c: false });
      continue;
    }
    const spread = SOLO_SPREAD[0] + (SOLO_SPREAD[1] - SOLO_SPREAD[0]) * rand();
    const crit = rand() < SOLO_CRIT_CHANCE;
    hits.push({ p, d: Math.round(base * spread * (crit ? SOLO_CRIT_MULT : 1)), c: crit });
  }
  return hits;
}

export function soloRunScore(hits: readonly SoloHit[]): number {
  return hits.reduce((a, h) => a + h.d, 0);
}

// ── 공동 페이즈 ─────────────────────────────────────────────────────────────
export const SOLO_PHASE_BASE_HP = 10_000_000;
export const SOLO_PHASE_GROWTH = 1.1;
export function soloPhaseHp(phase: number): number {
  return Math.round(SOLO_PHASE_BASE_HP * SOLO_PHASE_GROWTH ** (phase - 1));
}
/** 누적 피해 → 넘긴 페이즈 수(stage), 지금 페이즈에 들어간 양(into), 지금 페이즈 체력(need). 화면의 '현재 페이즈'는 stage + 1. */
export function soloPhaseFor(totalDamage: number): { stage: number; into: number; need: number } {
  let rest = Math.max(0, Math.floor(totalDamage));
  let stage = 0;
  while (stage < 10_000) {
    const need = soloPhaseHp(stage + 1);
    if (rest < need) return { stage, into: rest, need };
    rest -= need;
    stage++;
  }
  return { stage, into: 0, need: soloPhaseHp(stage + 1) };
}

// ── 보상(11-13 확정) ─────────────────────────────────────────────────────────
export type SoloReward = { diamond: number; boxes: number };
/** 구간 — 최고 기록이 닿은 가장 높은 하나. min = 그 구간의 문턱(0 = 참가). */
export const SOLO_TIERS: readonly ({ min: number; label: string } & SoloReward)[] = [
  { min: 0, label: '참가', diamond: 20, boxes: 6 },
  { min: 10_000, label: '1만', diamond: 30, boxes: 6 },
  { min: 50_000, label: '5만', diamond: 50, boxes: 9 },
  { min: 200_000, label: '20만', diamond: 70, boxes: 12 },
  { min: 500_000, label: '50만', diamond: 100, boxes: 18 },
  { min: 1_000_000, label: '100만', diamond: 150, boxes: 24 },
  { min: 2_000_000, label: '200만', diamond: 220, boxes: 30 },
  { min: 4_000_000, label: '400만', diamond: 300, boxes: 39 },
  { min: 8_000_000, label: '800만', diamond: 400, boxes: 48 },
];
export const SOLO_RANK_REWARDS: readonly ({ from: number; to: number } & SoloReward)[] = [
  { from: 1, to: 1, diamond: 2000, boxes: 90 },
  { from: 2, to: 2, diamond: 1500, boxes: 66 },
  { from: 3, to: 3, diamond: 1000, boxes: 45 },
  { from: 4, to: 10, diamond: 500, boxes: 24 },
  { from: 11, to: 30, diamond: 150, boxes: 9 },
];
export const SOLO_PHASE_BONUS_PER_STAGE = 0.02;
export const SOLO_PHASE_BONUS_CAP = 0.6;

export function soloTierIndex(best: number): number {
  let idx = 0;
  SOLO_TIERS.forEach((t, i) => {
    if (best >= t.min) idx = i;
  });
  return idx;
}
/** 최종 페이즈(넘긴 페이즈 수 stage) 보너스 배율 — 1 + min(60%, 2% × stage). */
export function soloPhaseBonus(stage: number): number {
  return 1 + Math.min(SOLO_PHASE_BONUS_CAP, Math.max(0, stage) * SOLO_PHASE_BONUS_PER_STAGE);
}
export function soloTierReward(best: number, stage: number): SoloReward & { tier: number } {
  const tier = soloTierIndex(best);
  const t = SOLO_TIERS[tier]!;
  const m = soloPhaseBonus(stage);
  // 상자는 우편에서 세 부위로 똑같이 나눠 주므로 3의 배수로 맞춘다(경제 규칙 — 상자는 3의 배수).
  return { tier, diamond: Math.round(t.diamond * m), boxes: Math.round((t.boxes * m) / 3) * 3 };
}
export function soloRankReward(rank: number): SoloReward {
  const r = SOLO_RANK_REWARDS.find((x) => rank >= x.from && rank <= x.to);
  return r ? { diamond: r.diamond, boxes: r.boxes } : { diamond: 0, boxes: 0 };
}
