import { describe, expect, it } from 'vitest';

import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_SUM_BP_MAX,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DURATION_MS,
  EXPEDITION_HOURS,
  expeditionCritBp,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_SLOTS,
  EXPEDITION_SYNERGY_GENERAL_MULT,
  EXPEDITION_SYNERGY_MATCH_MULT,
  expeditionWeightedSum,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_REFRESH_COST,
  expeditionAsBonusBp,
} from '@/lib/game/balance';

/** 파견 상수 불변식 + 경제 가드(BALANCE §11.4) — 수치 변경 시 문서·공시와 함께 갱신. */
describe('expedition balance invariants', () => {
  it('본상 3분기 확률 합 = 100%', () => {
    const { boxOnly, diamondOnly, both } = EXPEDITION_MAIN_ROLL_BP;
    expect(boxOnly + diamondOnly + both).toBe(10000);
  });

  it('시간 — 단일 8h(시간 타입·스케일 없음)', () => {
    expect(EXPEDITION_HOURS).toBe(8);
    expect(EXPEDITION_DURATION_MS).toBe(8 * 3_600_000);
  });

  it('수량 범위 정합(min ≤ max) + 세 분기 기대가치가 상자 1개=25💎 기준으로 ±10% 안에 정렬', () => {
    const a = EXPEDITION_BASE_AMOUNTS;
    expect(a.boxOnly.boxMin).toBeLessThanOrEqual(a.boxOnly.boxMax);
    expect(a.diamondOnly.diaMin).toBeLessThanOrEqual(a.diamondOnly.diaMax);
    expect(a.both.boxMin).toBeLessThanOrEqual(a.both.boxMax);
    expect(a.both.diaMin).toBeLessThanOrEqual(a.both.diaMax);
    const BOX_DIA = 25;
    const evBoxOnly = ((a.boxOnly.boxMin + a.boxOnly.boxMax) / 2) * BOX_DIA;
    const evDiaOnly = (a.diamondOnly.diaMin + a.diamondOnly.diaMax) / 2;
    const evBoth = ((a.both.boxMin + a.both.boxMax) / 2) * BOX_DIA + (a.both.diaMin + a.both.diaMax) / 2;
    const mid = (evBoxOnly + evDiaOnly + evBoth) / 3;
    for (const ev of [evBoxOnly, evDiaOnly, evBoth]) {
      expect(ev).toBeGreaterThanOrEqual(mid * 0.9);
      expect(ev).toBeLessThanOrEqual(mid * 1.1);
    }
  });

  it('경제 가드 — 무강화 기준(배율 0) 4슬롯 하루 다이아 기대 ≈ 229💎(±3%) · 축 ③ AS 1,000이면 ≈ 734💎', () => {
    const { diamondOnly, both } = EXPEDITION_MAIN_ROLL_BP;
    const a = EXPEDITION_BASE_AMOUNTS;
    const evDia =
      (diamondOnly / 10000) * ((a.diamondOnly.diaMin + a.diamondOnly.diaMax) / 2) +
      (both / 10000) * ((a.both.diaMin + a.both.diaMax) / 2);
    const critMult = 1 + (EXPEDITION_CRIT_BP / 10000) * (EXPEDITION_CRIT_MULT - 1);
    // 슬롯당 하루 1회 × 4슬롯(합산 강화 9,000+). 1회분 = 종전 시간 스케일 실측 가중 평균(2.48) 접어 넣은 값.
    const launchDaily = evDia * critMult * EXPEDITION_SLOTS;
    expect(launchDaily).toBeGreaterThanOrEqual(222);
    expect(launchDaily).toBeLessThanOrEqual(237);
    // 축 ③(아바타 강화 합, 상한 없음) — AS 1,000 아바타는 ×3.20.
    const as1000 = 1 + expeditionAsBonusBp(1000) / 10000;
    expect(launchDaily * as1000).toBeGreaterThanOrEqual(712);
    expect(launchDaily * as1000).toBeLessThanOrEqual(758);
    // 대성공 총 상한(25% = 기본 5 + 합산 20)만 얹은 상한(축 ③ 제외).
    const critMax = 1 + (expeditionCritBp(100000) / 10000) * (EXPEDITION_CRIT_MULT - 1);
    expect(launchDaily * (critMax / critMult)).toBeLessThanOrEqual(500);
    expect(expeditionCritBp(100000)).toBe(EXPEDITION_CRIT_BP + EXPEDITION_CRIT_SUM_BP_MAX);
    expect(expeditionCritBp(0)).toBe(EXPEDITION_CRIT_BP);
  });

  it('시너지·슬롯 정합 — 가중 일치 1.3 > 일반 1.15 > 1, 슬롯 4칸은 합산 강화 0/3k/6k/9k 단조 증가', () => {
    expect(EXPEDITION_SYNERGY_MATCH_MULT).toBeGreaterThan(EXPEDITION_SYNERGY_GENERAL_MULT);
    expect(EXPEDITION_SYNERGY_GENERAL_MULT).toBeGreaterThan(1);
    expect(expeditionWeightedSum([{ level: 100, region: 'volcano' }, { level: 100, region: 'general' }, { level: 100, region: 'orc' }], 'volcano')).toBe(345);
    expect(EXPEDITION_SLOT_UNLOCKS.map((u) => u.slot)).toEqual([1, 2, 3, 4]);
    expect(EXPEDITION_SLOT_UNLOCKS.map((u) => u.enhanceSum)).toEqual([0, 3000, 6000, 9000]);
    expect(EXPEDITION_SLOT_UNLOCKS.length).toBe(EXPEDITION_SLOTS);
  });

  it('슬롯 해금·새로고침 — 확정 수치(합산 강화 0/3k/6k/9k, 무료 3회·20💎)', () => {
    expect(EXPEDITION_SLOT_UNLOCKS).toEqual([
      { slot: 1, enhanceSum: 0 },
      { slot: 2, enhanceSum: 3000 },
      { slot: 3, enhanceSum: 6000 },
      { slot: 4, enhanceSum: 9000 },
    ]);
    expect(EXPEDITION_REFRESH_FREE_PER_DAY).toBe(3);
    expect(EXPEDITION_REFRESH_COST).toBe(20);
  });
});
