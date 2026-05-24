import { describe, expect, it } from 'vitest';

import {
  effectiveRateBp,
  effectiveOutcomeProbsBp,
  failOutcome,
  levelAfterFail,
  baseSuccessRateBp,
  downRateBp,
  MAX_TRANSCEND,
  CYCLE_LEN,
  CYCLE_TIME_BASE,
  cycleIndex,
  cycleLevel,
  cycleTimeMultiplier,
  baseAttemptDurationMs,
  enhanceDurationMs,
  transcendFodderForStep,
  transcendFodderCumulative,
  transcendBonusBp,
  enhanceBasePower,
  pieceCombatPower,
  totalCombatPower,
} from '@/lib/game/balance';

/**
 * 강화 결정 로직(resolveEnhance 핵심 분기) + 초월/전투력 공식 회귀 방지.
 * 이 함수들의 시그니처/반환이 바뀌면 게임 밸런스가 실시간으로 바뀌고
 * 확률공시(§33)와도 불일치 → 모든 변경은 의도적이어야 함.
 */

describe('effectiveRateBp — 시간 비례 effective rate', () => {
  it('elapsed=0 → 0 (시작 즉시 시도 = 거의 실패)', () => {
    expect(effectiveRateBp(5000, 0, 10000)).toBe(0);
  });
  it('elapsed=총 → baseRate 도달', () => {
    expect(effectiveRateBp(5000, 10000, 10000)).toBe(5000);
  });
  it('elapsed 초과 → baseRate 클램프', () => {
    expect(effectiveRateBp(5000, 99999, 10000)).toBe(5000);
  });
  it('elapsed 음수 → 0 클램프', () => {
    expect(effectiveRateBp(5000, -1, 10000)).toBe(0);
  });
  it('절반 경과 → 절반 baseRate', () => {
    expect(effectiveRateBp(8000, 5000, 10000)).toBe(4000);
  });
  it('totalMs ≤ 0 (방어) → baseRate 즉시', () => {
    expect(effectiveRateBp(5000, 0, 0)).toBe(5000);
    expect(effectiveRateBp(5000, 0, -10)).toBe(5000);
  });
});

describe('사이클 헬퍼 — 100단위 리셋, 시간 2배', () => {
  it('cycleIndex / cycleLevel', () => {
    expect(cycleIndex(0)).toBe(0);
    expect(cycleLevel(0)).toBe(0);
    expect(cycleIndex(99)).toBe(0);
    expect(cycleLevel(99)).toBe(99);
    expect(cycleIndex(100)).toBe(1);
    expect(cycleLevel(100)).toBe(0);
    expect(cycleIndex(199)).toBe(1);
    expect(cycleLevel(199)).toBe(99);
    expect(cycleIndex(250)).toBe(2);
    expect(cycleLevel(250)).toBe(50);
  });
  it('cycleTimeMultiplier = 2^cycle', () => {
    expect(cycleTimeMultiplier(0)).toBe(1);
    expect(cycleTimeMultiplier(50)).toBe(1);
    expect(cycleTimeMultiplier(100)).toBe(CYCLE_TIME_BASE);
    expect(cycleTimeMultiplier(199)).toBe(CYCLE_TIME_BASE);
    expect(cycleTimeMultiplier(200)).toBe(CYCLE_TIME_BASE ** 2);
  });
  it('enhanceDurationMs = baseAttempt × 2^cycle', () => {
    for (const lv of [0, 1, 10, 50, 99]) {
      expect(enhanceDurationMs(lv)).toBe(baseAttemptDurationMs(lv));
      expect(enhanceDurationMs(lv + CYCLE_LEN)).toBe(baseAttemptDurationMs(lv) * CYCLE_TIME_BASE);
      expect(enhanceDurationMs(lv + 2 * CYCLE_LEN)).toBe(
        baseAttemptDurationMs(lv) * CYCLE_TIME_BASE ** 2,
      );
    }
  });
});

describe('failOutcome — 사이클 내 안전/하락 분기 (ℓ 기준)', () => {
  it('ℓ ≤ 51 hold(안전), 모든 사이클', () => {
    expect(failOutcome(0)).toBe('hold');
    expect(failOutcome(51)).toBe('hold');
    expect(failOutcome(100)).toBe('hold'); // 사이클1의 ℓ=0
    expect(failOutcome(151)).toBe('hold');
    expect(failOutcome(251)).toBe('hold');
  });
  it('ℓ ≥ 52 down(하락), 모든 사이클', () => {
    expect(failOutcome(52)).toBe('down');
    expect(failOutcome(99)).toBe('down');
    expect(failOutcome(152)).toBe('down'); // 사이클1의 ℓ=52
    expect(failOutcome(199)).toBe('down');
  });
});

describe('levelAfterFail — 사이클 내 하한(+51)', () => {
  it('안전(hold): fromLevel 그대로', () => {
    expect(levelAfterFail(0)).toBe(0);
    expect(levelAfterFail(51)).toBe(51);
    expect(levelAfterFail(100)).toBe(100); // ℓ=0 안전
    expect(levelAfterFail(151)).toBe(151);
  });
  it('하락(down): −1, 사이클 경계 가로지르지 않음', () => {
    expect(levelAfterFail(52)).toBe(51);
    expect(levelAfterFail(99)).toBe(98);
    expect(levelAfterFail(152)).toBe(151); // 사이클1: 하한 +151
    expect(levelAfterFail(199)).toBe(198);
    expect(levelAfterFail(252)).toBe(251); // 사이클2: 하한 +251
  });
});

describe('baseSuccessRateBp — 사이클 내 동일 곡선', () => {
  it('ℓ 0~9 = 10000(100%)', () => {
    expect(baseSuccessRateBp(0)).toBe(10000);
    expect(baseSuccessRateBp(9)).toBe(10000);
    expect(baseSuccessRateBp(100)).toBe(10000); // 사이클1 ℓ=0
    expect(baseSuccessRateBp(109)).toBe(10000);
  });
  it('ℓ 51 = 5000(50%) 모든 사이클', () => {
    expect(baseSuccessRateBp(51)).toBe(5000);
    expect(baseSuccessRateBp(151)).toBe(5000);
    expect(baseSuccessRateBp(251)).toBe(5000);
  });
  it('ℓ 52 = 4800 모든 사이클', () => {
    expect(baseSuccessRateBp(52)).toBe(4800);
    expect(baseSuccessRateBp(152)).toBe(4800);
  });
  it('ℓ 99 = 2500(25%) 모든 사이클 — 고레벨 상향(2026-05-25)', () => {
    expect(baseSuccessRateBp(99)).toBe(2500);
    expect(baseSuccessRateBp(199)).toBe(2500);
  });
});

describe('downRateBp — 사이클 내 고정 곡선(시간 무관)', () => {
  it('ℓ ≤ 51 = 0(안전 구간)', () => {
    for (const lv of [0, 10, 51, 100, 151, 251]) {
      expect(downRateBp(lv)).toBe(0);
    }
  });
  it('ℓ 52 = 800(8%) 모든 사이클', () => {
    expect(downRateBp(52)).toBe(800);
    expect(downRateBp(152)).toBe(800);
  });
  it('ℓ 99 = 1500(15%) 모든 사이클', () => {
    expect(downRateBp(99)).toBe(1500);
    expect(downRateBp(199)).toBe(1500);
  });
  it('불변식: baseRate + downRate ≤ 10000 모든 ℓ', () => {
    for (let lv = 0; lv < CYCLE_LEN; lv++) {
      expect(baseSuccessRateBp(lv) + downRateBp(lv)).toBeLessThanOrEqual(10000);
    }
  });
});

describe('effectiveOutcomeProbsBp — 3분기 시간 곡선', () => {
  it('합 = 10000 (모든 t)', () => {
    for (const lv of [0, 30, 51, 60, 99, 152, 199]) {
      const base = baseSuccessRateBp(lv);
      const down = downRateBp(lv);
      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        const p = effectiveOutcomeProbsBp(base, down, frac * 10000, 10000);
        expect(p.success + p.hold + p.down).toBe(10000);
      }
    }
  });
  it('t=0: success=0, down=고정, hold=10000-down', () => {
    const base = baseSuccessRateBp(60);
    const down = downRateBp(60);
    const p = effectiveOutcomeProbsBp(base, down, 0, 10000);
    expect(p.success).toBe(0);
    expect(p.down).toBe(down);
    expect(p.hold).toBe(10000 - down);
  });
  it('t=total: success=base, down=고정, hold=10000-base-down', () => {
    const base = baseSuccessRateBp(60);
    const down = downRateBp(60);
    const p = effectiveOutcomeProbsBp(base, down, 10000, 10000);
    expect(p.success).toBe(base);
    expect(p.down).toBe(down);
    expect(p.hold).toBe(10000 - base - down);
  });
  it('안전 구간(down=0): hold = 10000 - success', () => {
    const base = baseSuccessRateBp(30);
    const p = effectiveOutcomeProbsBp(base, 0, 5000, 10000);
    expect(p.down).toBe(0);
    expect(p.success).toBe(Math.round(base * 0.5));
    expect(p.hold).toBe(10000 - p.success);
  });
});

describe('초월 — 제물 수·누적·전투력 배수', () => {
  it('transcendFodderForStep: 선형 1→10', () => {
    expect(transcendFodderForStep(1)).toBe(1);
    expect(transcendFodderForStep(5)).toBe(5);
    expect(transcendFodderForStep(10)).toBe(10);
  });
  it('transcendFodderCumulative: 1+2+...+T', () => {
    expect(transcendFodderCumulative(1)).toBe(1);
    expect(transcendFodderCumulative(3)).toBe(6);
    expect(transcendFodderCumulative(10)).toBe(55);
  });
  it('transcendBonusBp: T0=0, T10=10000(+100%)', () => {
    expect(transcendBonusBp(0)).toBe(0);
    expect(transcendBonusBp(MAX_TRANSCEND)).toBe(10000);
  });
  it('transcendBonusBp 단조 증가', () => {
    let prev = -1;
    for (let t = 0; t <= MAX_TRANSCEND; t++) {
      const v = transcendBonusBp(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('전투력 공식', () => {
  it('enhanceBasePower(0) = 10', () => {
    expect(enhanceBasePower(0)).toBe(10);
  });
  it('enhanceBasePower(L) = round(10×(1+L)^1.5) — 단조 증가', () => {
    let prev = -1;
    for (const lv of [0, 1, 10, 30, 51, 99]) {
      const v = enhanceBasePower(lv);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
  it('pieceCombatPower: T0 = 기반, T10 = 기반×2', () => {
    const base = enhanceBasePower(30);
    expect(pieceCombatPower(30, 0)).toBe(base);
    expect(pieceCombatPower(30, MAX_TRANSCEND)).toBe(base * 2);
  });
  it('totalCombatPower: 도감 보너스 0이면 합과 동일', () => {
    expect(totalCombatPower([100, 200, 300], 0)).toBe(600);
  });
  it('totalCombatPower: 도감 합 N → ×(1 + N×0.005)', () => {
    // 도감강화합 100 → ×1.5
    expect(totalCombatPower([100, 200, 300], 100)).toBe(900);
  });
});
