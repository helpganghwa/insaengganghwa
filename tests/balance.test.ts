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
  ATTEMPT_DURATION_SCALE,
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
  bpSegmentIndex,
  bpSegmentEndLevel,
  bpTierReward,
  bpRangeReward,
  bpSegmentPriceKrw,
} from '@/lib/game/balance';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';

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
  it('enhanceDurationMs = baseAttempt × 2^cycle × 0.5 (전체 2배속, 2026-05-31)', () => {
    for (const lv of [0, 1, 10, 50, 99]) {
      const b = baseAttemptDurationMs(lv);
      expect(enhanceDurationMs(lv)).toBe(Math.round(b * ATTEMPT_DURATION_SCALE));
      expect(enhanceDurationMs(lv + CYCLE_LEN)).toBe(
        Math.round(b * CYCLE_TIME_BASE * ATTEMPT_DURATION_SCALE),
      );
      expect(enhanceDurationMs(lv + 2 * CYCLE_LEN)).toBe(
        Math.round(b * CYCLE_TIME_BASE ** 2 * ATTEMPT_DURATION_SCALE),
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
        // 4분기(success/mega/hold/down) 합 = 10000. mega는 success_total에서 분리된 분량.
        expect(p.success + p.mega + p.hold + p.down).toBe(10000);
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
  it('t=total: success_total(success+mega)=base, down=고정, hold=10000-base-down', () => {
    const base = baseSuccessRateBp(60);
    const down = downRateBp(60);
    const p = effectiveOutcomeProbsBp(base, down, 10000, 10000);
    expect(p.success + p.mega).toBe(base);
    expect(p.down).toBe(down);
    expect(p.hold).toBe(10000 - base - down);
  });
  it('안전 구간(down=0): hold = 10000 - success_total', () => {
    const base = baseSuccessRateBp(30);
    const p = effectiveOutcomeProbsBp(base, 0, 5000, 10000);
    expect(p.down).toBe(0);
    // t=0.5 → success_total = round(base×0.5), 그 중 mega 분리.
    expect(p.success + p.mega).toBe(Math.round(base * 0.5));
    expect(p.hold).toBe(10000 - p.success - p.mega);
  });
});

describe('초월 — 제물 수·누적·전투력 배수', () => {
  it('transcendFodderForStep: 선형 무한(T단계 = T개)', () => {
    expect(transcendFodderForStep(1)).toBe(1);
    expect(transcendFodderForStep(5)).toBe(5);
    expect(transcendFodderForStep(10)).toBe(10);
    // T10 이상도 선형 — 캡 없음.
    expect(transcendFodderForStep(11)).toBe(11);
    expect(transcendFodderForStep(20)).toBe(20);
    expect(transcendFodderForStep(100)).toBe(100);
  });
  it('transcendFodderCumulative: 1+2+...+T = T(T+1)/2', () => {
    expect(transcendFodderCumulative(1)).toBe(1);
    expect(transcendFodderCumulative(3)).toBe(6);
    expect(transcendFodderCumulative(10)).toBe(55);
    expect(transcendFodderCumulative(11)).toBe(66);
    expect(transcendFodderCumulative(20)).toBe(210);
  });
  it('transcendBonusBp: T0=0, T10=10000(+100%), T11+ 레벨당 +1000bp', () => {
    expect(transcendBonusBp(0)).toBe(0);
    expect(transcendBonusBp(MAX_TRANSCEND)).toBe(10000);
    // T11부터 레벨당 +10%p(1000bp) 무한 증가.
    expect(transcendBonusBp(11)).toBe(11000);
    expect(transcendBonusBp(20)).toBe(20000);
    expect(transcendBonusBp(50)).toBe(50000);
  });
  it('transcendBonusBp 단조 증가(T10 경계 넘어서도)', () => {
    let prev = -1;
    for (let t = 0; t <= MAX_TRANSCEND + 20; t++) {
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
  it('combatPowerFromOwned: 보유 카탈로그별 개별 전투력 합(착용 무관)', () => {
    // 서로 다른 카탈로그 3개 → 단순 합. P(30)=1726, P(40)=2625, P(20)=962.
    const owned = [
      { catalogItemId: 1, enhanceLevel: 30, transcendLevel: 0 },
      { catalogItemId: 2, enhanceLevel: 40, transcendLevel: 0 },
      { catalogItemId: 3, enhanceLevel: 20, transcendLevel: 0 },
    ];
    const expected =
      pieceCombatPower(30, 0) + pieceCombatPower(40, 0) + pieceCombatPower(20, 0);
    expect(combatPowerFromOwned(owned)).toBe(expected);
  });
  it('combatPowerFromOwned: 같은 카탈로그 중복은 최강 1개만 합산', () => {
    // catalog 1을 2개 보유(+10, +50) → +50만. catalog 2는 +30.
    const owned = [
      { catalogItemId: 1, enhanceLevel: 10, transcendLevel: 0 },
      { catalogItemId: 1, enhanceLevel: 50, transcendLevel: 0 },
      { catalogItemId: 2, enhanceLevel: 30, transcendLevel: 0 },
    ];
    expect(combatPowerFromOwned(owned)).toBe(
      pieceCombatPower(50, 0) + pieceCombatPower(30, 0),
    );
  });
  it('combatPowerFromOwned: 최강 판정은 개별 전투력 기준(낮은 강화+고초월 > 높은 강화)', () => {
    // 같은 카탈로그: +49 T10 vs +50 T0 — 전자가 더 강함.
    const owned = [
      { catalogItemId: 1, enhanceLevel: 49, transcendLevel: MAX_TRANSCEND },
      { catalogItemId: 1, enhanceLevel: 50, transcendLevel: 0 },
    ];
    expect(pieceCombatPower(49, MAX_TRANSCEND)).toBeGreaterThan(pieceCombatPower(50, 0));
    expect(combatPowerFromOwned(owned)).toBe(pieceCombatPower(49, MAX_TRANSCEND));
  });
  it('combatPowerFromOwned: 빈 보유 = 0', () => {
    expect(combatPowerFromOwned([])).toBe(0);
  });
});

describe('배틀패스 — 구간·보상·가격', () => {
  it('bpSegmentIndex: 강화 100단위 / 초월 10단위', () => {
    expect(bpSegmentIndex('enhance', 1)).toBe(0);
    expect(bpSegmentIndex('enhance', 100)).toBe(0);
    expect(bpSegmentIndex('enhance', 101)).toBe(1);
    expect(bpSegmentIndex('enhance', 250)).toBe(2);
    expect(bpSegmentIndex('transcend', 10)).toBe(0);
    expect(bpSegmentIndex('transcend', 11)).toBe(1);
  });
  it('bpSegmentEndLevel', () => {
    expect(bpSegmentEndLevel('enhance', 0)).toBe(100);
    expect(bpSegmentEndLevel('enhance', 2)).toBe(300);
    expect(bpSegmentEndLevel('transcend', 0)).toBe(10);
    expect(bpSegmentEndLevel('transcend', 1)).toBe(20);
  });
  it('bpTierReward: 강화 ×2^c / 초월 ×(c+1), 무료=프리미엄/5', () => {
    // 강화 c0: 무료 10 / 프리미엄 50, c1: 20 / 100, c2: 40 / 200
    expect(bpTierReward('enhance', 50, false)).toBe(10);
    expect(bpTierReward('enhance', 50, true)).toBe(50);
    expect(bpTierReward('enhance', 150, true)).toBe(100);
    expect(bpTierReward('enhance', 250, true)).toBe(200);
    // 초월 c0: 10/50, c1: 20/100, c2: 30/150
    expect(bpTierReward('transcend', 5, false)).toBe(10);
    expect(bpTierReward('transcend', 5, true)).toBe(50);
    expect(bpTierReward('transcend', 15, true)).toBe(100);
    expect(bpTierReward('transcend', 25, true)).toBe(150);
  });
  it('bpRangeReward: 구간 경계 넘는 합산', () => {
    // 강화 c0 전체(1~100) 무료 = 100×10 = 1000, 프리미엄 = 5000
    expect(bpRangeReward('enhance', 0, 100, false)).toBe(1000);
    expect(bpRangeReward('enhance', 0, 100, true)).toBe(5000);
    // c1 전체(101~200) 프리미엄 = 100×100 = 10000
    expect(bpRangeReward('enhance', 100, 200, true)).toBe(10000);
    // 경계 가로지름: 1~150 프리미엄 = c0(5000) + c1 50단계×100(5000) = 10000
    expect(bpRangeReward('enhance', 0, 150, true)).toBe(10000);
    // 초월 c0(1~10) 프리미엄 = 10×50 = 500
    expect(bpRangeReward('transcend', 0, 10, true)).toBe(500);
    expect(bpRangeReward('enhance', 50, 50, true)).toBe(0); // 빈 범위
  });
  it('bpSegmentPriceKrw: 강화 ×2계단 / 초월 선형 (no-brainer)', () => {
    expect(bpSegmentPriceKrw('enhance', 0)).toBe(9900);
    expect(bpSegmentPriceKrw('enhance', 1)).toBe(19900);
    expect(bpSegmentPriceKrw('enhance', 2)).toBe(39900);
    expect(bpSegmentPriceKrw('enhance', 3)).toBe(79900);
    expect(bpSegmentPriceKrw('transcend', 0)).toBe(9900);
    expect(bpSegmentPriceKrw('transcend', 1)).toBe(19900);
    expect(bpSegmentPriceKrw('transcend', 2)).toBe(29900);
  });
});
