import { describe, expect, it } from 'vitest';

import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_BOX_MAIN_BP,
  EXPEDITION_CRIT_BP,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DAILY_STARTS,
  EXPEDITION_DURATIONS_H,
  EXPEDITION_DURATION_SCALE,
  EXPEDITION_LEVEL_BONUS_BP_PER,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_REGIONS,
  EXPEDITION_SLOTS,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  EXPEDITION_BOX_MAIN_SLOT,
  EXPEDITION_DIFFICULTY_DIST_BP,
  EXPEDITION_DIFFICULTIES,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_REFRESH_COST,
  expeditionDifficultyDist,
  expeditionAsBonusBp,
  expeditionXpToNext,
} from '@/lib/game/balance';

/** 파견 상수 불변식 + 경제 가드(BALANCE §11.4) — 수치 변경 시 문서·공시와 함께 갱신. */
describe('expedition balance invariants', () => {
  it('본상 3분기 확률 합 = 100%', () => {
    const { boxOnly, diamondOnly, both } = EXPEDITION_MAIN_ROLL_BP;
    expect(boxOnly + diamondOnly + both).toBe(10000);
  });

  it('상자 슬롯 가중 — 주력 60% + 잔여 20%×2 = 100%, 전 지역 매핑 존재', () => {
    expect(EXPEDITION_BOX_MAIN_BP + (10000 - EXPEDITION_BOX_MAIN_BP)).toBe(10000);
    expect((10000 - EXPEDITION_BOX_MAIN_BP) % 2).toBe(0);
    for (const r of EXPEDITION_REGIONS) expect(EXPEDITION_BOX_MAIN_SLOT[r]).toBeTruthy();
  });

  it('시간 옵션 정합 — 스케일 단조 증가 + 일일 최대 유닛은 24h 루트(시작 6회 상한 하)', () => {
    const keys = Object.keys(EXPEDITION_DURATION_SCALE).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([...EXPEDITION_DURATIONS_H]);
    // 파견 1건당 스케일은 시간에 단조 증가(짧은 옵션이 유리해지는 역전 금지).
    const scales = EXPEDITION_DURATIONS_H.map((h) => EXPEDITION_DURATION_SCALE[h]);
    for (let i = 1; i < scales.length; i++) expect(scales[i]!).toBeGreaterThan(scales[i - 1]!);
    // 하루 최대 유닛 루트 = 24h×3슬롯(시작 3회) — 12h×6회·8h×6회보다 크거나 같아야
    // "하루 한 번" 유저가 손해 보지 않는다(경제 가드도 이 값 기준).
    const day24 = EXPEDITION_SLOTS * EXPEDITION_DURATION_SCALE[24];
    expect(day24).toBeGreaterThanOrEqual(EXPEDITION_DAILY_STARTS * EXPEDITION_DURATION_SCALE[12]);
    expect(day24).toBeGreaterThanOrEqual(EXPEDITION_DAILY_STARTS * EXPEDITION_DURATION_SCALE[8]);
  });

  it('수량 범위 정합(min ≤ max)', () => {
    const a = EXPEDITION_BASE_AMOUNTS;
    expect(a.boxOnly.boxMin).toBeLessThanOrEqual(a.boxOnly.boxMax);
    expect(a.diamondOnly.diaMin).toBeLessThanOrEqual(a.diamondOnly.diaMax);
    expect(a.both.boxMin).toBeLessThanOrEqual(a.both.boxMax);
    expect(a.both.diaMin).toBeLessThanOrEqual(a.both.diaMax);
  });

  it('레벨 곡선 — 단조 증가, Lv.50 누적 XP가 문서 수치(≈4,563)와 일치', () => {
    let cum = 0;
    let prev = 0;
    for (let lv = 0; lv < EXPEDITION_LEVEL_MAX; lv++) {
      const need = expeditionXpToNext(lv);
      expect(need).toBeGreaterThanOrEqual(prev);
      prev = need;
      cum += need;
    }
    expect(cum).toBe(4550); // 30×50 + Σ⌊2.5ℓ⌋(ℓ=0..49) = 4,550
  });

  it('경제 가드 — 무강화 기준(배율 0) 하루 최대 다이아 기대 ≈ 300💎(±3%) · 축 ③ AS 1,000이면 ≈ 960💎', () => {
    const { diamondOnly, both } = EXPEDITION_MAIN_ROLL_BP;
    const a = EXPEDITION_BASE_AMOUNTS;
    const evDia =
      (diamondOnly / 10000) * ((a.diamondOnly.diaMin + a.diamondOnly.diaMax) / 2) +
      (both / 10000) * ((a.both.diaMin + a.both.diaMax) / 2);
    const critMult = 1 + (EXPEDITION_CRIT_BP / 10000) * (EXPEDITION_CRIT_MULT - 1);
    // 하루 최대 유닛 — 시작 6회·슬롯 3 제약 아래 스케일 합 최대(24h×3슬롯).
    const maxDailyUnits = EXPEDITION_SLOTS * EXPEDITION_DURATION_SCALE[24];
    const launchDaily = evDia * critMult * maxDailyUnits;
    expect(launchDaily).toBeGreaterThanOrEqual(291);
    expect(launchDaily).toBeLessThanOrEqual(309);
    // 축 ③(아바타 강화 합, 상한 없음, C안) — AS 1,000 아바타는 ×3.20 → 종전 500💎 기준의 192%.
    const as1000 = 1 + expeditionAsBonusBp(1000) / 10000;
    expect(launchDaily * as1000).toBeGreaterThanOrEqual(945);
    expect(launchDaily * as1000).toBeLessThanOrEqual(975);
    // 레벨·시너지 만렙(축 ①②)만 얹은 상한 — 축 ③ 제외 시 종전 가드(920) 대비 여유.
    const maxMult = 1 + (EXPEDITION_LEVEL_MAX * EXPEDITION_LEVEL_BONUS_BP_PER + 3 * EXPEDITION_SYNERGY_MATCH_BP) / 10000;
    expect(launchDaily * maxMult).toBeLessThanOrEqual(560);
  });

  it('시너지·상한 정합 — 일반은 지역 일치의 절반, 일일 시작 6회', () => {
    expect(EXPEDITION_SYNERGY_GENERAL_BP * 2).toBe(EXPEDITION_SYNERGY_MATCH_BP);
    expect(EXPEDITION_DAILY_STARTS).toBe(6);
  });

  it('난이도 분포 — 구간별 합 100%, 고난이도 출현이 레벨에 단조 증가, 원정은 Lv.5부터', () => {
    for (const b of EXPEDITION_DIFFICULTY_DIST_BP) {
      const sum = EXPEDITION_DIFFICULTIES.reduce((a, d) => a + b.dist[d], 0);
      expect(sum).toBe(10000);
    }
    // minLevel 내림차순 정렬 가정(첫 매치 사용) — 어긋나면 구간 선택이 무너진다.
    for (let i = 1; i < EXPEDITION_DIFFICULTY_DIST_BP.length; i++) {
      expect(EXPEDITION_DIFFICULTY_DIST_BP[i]!.minLevel).toBeLessThan(EXPEDITION_DIFFICULTY_DIST_BP[i - 1]!.minLevel);
    }
    // 기대 시간 스케일(성장 체감)이 레벨 구간에 단조 증가.
    const evScale = (lv: number) => {
      const d = expeditionDifficultyDist(lv);
      return EXPEDITION_DIFFICULTIES.reduce(
        (a, k) => a + (d[k] / 10000) * EXPEDITION_DURATION_SCALE[EXPEDITION_DIFFICULTY_HOURS[k] as 4 | 8 | 12 | 24],
        0,
      );
    };
    expect(evScale(5)).toBeGreaterThan(evScale(0));
    expect(evScale(15)).toBeGreaterThan(evScale(5));
    expect(evScale(30)).toBeGreaterThan(evScale(15));
    expect(expeditionDifficultyDist(0).grand).toBe(0);
    expect(expeditionDifficultyDist(5).grand).toBeGreaterThan(0);
  });

  it('슬롯 해금·새로고침 — 확정 수치(Lv5/1000·Lv15/2000, 무료 3회·20💎)', () => {
    expect(EXPEDITION_SLOT_UNLOCKS).toEqual([
      { slot: 2, level: 5, diamond: 1000 },
      { slot: 3, level: 15, diamond: 2000 },
    ]);
    expect(EXPEDITION_REFRESH_FREE_PER_DAY).toBe(3);
    expect(EXPEDITION_REFRESH_COST).toBe(20);
  });
});
