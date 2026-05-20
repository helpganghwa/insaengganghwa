import { describe, expect, it } from 'vitest';

import {
  effectiveRateBp,
  failOutcome,
  levelAfterFail,
  baseSuccessRateBp,
  SAFE_MAX_LEVEL,
  MAX_TRANSCEND,
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

describe('failOutcome — 안전/하락 분기', () => {
  it('+0 ~ +SAFE_MAX_LEVEL(51): hold(안전)', () => {
    expect(failOutcome(0)).toBe('hold');
    expect(failOutcome(10)).toBe('hold');
    expect(failOutcome(SAFE_MAX_LEVEL)).toBe('hold');
  });
  it('+SAFE_MAX_LEVEL+1(52) 이상: down(하락)', () => {
    expect(failOutcome(52)).toBe('down');
    expect(failOutcome(99)).toBe('down');
    expect(failOutcome(100)).toBe('down');
  });
});

describe('levelAfterFail — 실패 시 결과 레벨', () => {
  it('안전 구간(hold): fromLevel 그대로', () => {
    expect(levelAfterFail(0)).toBe(0);
    expect(levelAfterFail(30)).toBe(30);
    expect(levelAfterFail(51)).toBe(51);
  });
  it('하락 구간(down): −1, 하한 51', () => {
    expect(levelAfterFail(52)).toBe(51);
    expect(levelAfterFail(60)).toBe(59);
    expect(levelAfterFail(100)).toBe(99);
  });
});

describe('baseSuccessRateBp — 공시 곡선', () => {
  it('+0~9 = 10000(100%) 평탄', () => {
    expect(baseSuccessRateBp(0)).toBe(10000);
    expect(baseSuccessRateBp(9)).toBe(10000);
  });
  it('+10 앵커 = 10000', () => {
    expect(baseSuccessRateBp(10)).toBe(10000);
  });
  it('+51 앵커 = 5000(50%)', () => {
    expect(baseSuccessRateBp(51)).toBe(5000);
  });
  it('+52 앵커 = 4800', () => {
    expect(baseSuccessRateBp(52)).toBe(4800);
  });
  it('+99 = 1000(10%)', () => {
    expect(baseSuccessRateBp(99)).toBe(1000);
  });
  it('+100 이상 = 1000 고정', () => {
    expect(baseSuccessRateBp(100)).toBe(1000);
    expect(baseSuccessRateBp(500)).toBe(1000);
  });
  it('음수/소수 — 0으로 클램프/내림', () => {
    expect(baseSuccessRateBp(-5)).toBe(10000);
    expect(baseSuccessRateBp(9.9)).toBe(10000);
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
