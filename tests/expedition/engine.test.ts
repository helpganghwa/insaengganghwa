import { describe, expect, it } from 'vitest';

import {
  applyCrit,
  applyMultiplier,
  effectiveSlots,
  critBp,
  rollBoxSlots,
  rollMission,
  avatarWeightedSum,
  type Rng10k,
} from '@/lib/game/expedition/engine';
import { EXPEDITION_BASE_AMOUNTS, EXPEDITION_DURATION_MS, EXPEDITION_HOURS, EXPEDITION_REGIONS } from '@/lib/game/balance';

/** 결정론 rng — 시퀀스 소진 후 0. */
const seq = (vals: number[]): Rng10k => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

describe('expedition engine — 미션 롤', () => {
  it('보상 사전 확정 — 셋 중 하나, 수량은 1회분 범위 그대로(시간 스케일 없음), 시간은 단일 8h', () => {
    // 지역 0(swamp) → 본상 roll 0(boxOnly 55%) → 수량 roll 0(최소) → 슬롯 roll들
    const m = rollMission(seq([0, 0, 0]));
    expect(m.region).toBe('swamp');
    expect(m.durationMs).toBe(EXPEDITION_DURATION_MS);
    expect(m.durationMs).toBe(8 * 3_600_000);
    expect(m.reward.kind).toBe('box');
    const total = Object.values(m.reward.boxes!).reduce((a, b) => a + b, 0);
    expect(total).toBe(EXPEDITION_BASE_AMOUNTS.boxOnly.boxMin);
    expect('xp' in m.reward).toBe(false); // XP·레벨 없음
  });

  it('다이아 분기 — 본상 roll 5500..7499, 수량 150~290 균등', () => {
    const lo = rollMission(seq([0, 5500, 0]));
    expect(lo.reward.kind).toBe('dia');
    expect(lo.reward.diamond).toBe(EXPEDITION_BASE_AMOUNTS.diamondOnly.diaMin);
    const hi = rollMission(seq([0, 7499, 140])); // 150 + 140 % 141 = 290
    expect(hi.reward.diamond).toBe(EXPEDITION_BASE_AMOUNTS.diamondOnly.diaMax);
  });

  it('둘 다 분기 — 본상 roll 7500.., 상자·다이아 각각 범위 안', () => {
    const m = rollMission(seq([5, 9999, 3, 0, 0, 0, 0, 0, 0, 0, 0, 35]));
    expect(m.region).toBe('angel');
    expect(m.reward.kind).toBe('both');
    const total = Object.values(m.reward.boxes!).reduce((a, b) => a + b, 0);
    expect(total).toBe(EXPEDITION_BASE_AMOUNTS.both.boxMin + 3);
    expect(m.reward.diamond).toBe(EXPEDITION_BASE_AMOUNTS.both.diaMin + 35);
  });

  it('지역은 6곳 균등 — rng % 6', () => {
    for (let i = 0; i < 6; i++) expect(rollMission(seq([i, 0, 0])).region).toBe(EXPEDITION_REGIONS[i]);
    expect(rollMission(seq([6, 0, 0])).region).toBe(EXPEDITION_REGIONS[0]);
  });

  it('상자 슬롯 — 부위 3종 균등 랜덤', () => {
    let i = 7;
    const rng: Rng10k = () => (i = (i * 9301 + 49297) % 10000);
    const acc = rollBoxSlots(rng, 'volcano', 3000);
    expect(acc.weapon + acc.armor + acc.accessory).toBe(3000);
    for (const v of [acc.weapon, acc.armor, acc.accessory]) {
      expect(v / 3000).toBeGreaterThan(0.28);
      expect(v / 3000).toBeLessThan(0.39);
    }
  });
});

describe('expedition engine — 시너지·배율', () => {
  const snap = {
    weaponKey: 'volcano_dancer_daggers', // 화산
    armorKey: 'general_twin_flintlocks', // 일반(슬롯은 무관 — 지역만 본다)
    accessoryKey: 'orc_hunter_boomerang', // 오크 부락
  };
  it('가중 강화 합 — 일치 ×1.3 / 일반 ×1.15 / 불일치 ×1', () => {
    const lv = new Map([
      ['volcano_dancer_daggers', 100],
      ['general_twin_flintlocks', 100],
      ['orc_hunter_boomerang', 100],
    ]);
    expect(avatarWeightedSum(snap, lv, 'volcano')).toBe(130 + 115 + 100); // 화산 일치 + 일반 + 불일치
    expect(avatarWeightedSum(snap, lv, 'orc')).toBe(100 + 115 + 130);
    expect(avatarWeightedSum(snap, lv, 'swamp')).toBe(100 + 115 + 100); // 일반만 가중
    expect(avatarWeightedSum(null, lv, 'swamp')).toBe(0);
    expect(avatarWeightedSum({ a: 'no_such_key' }, lv, 'swamp')).toBe(0);
  });
  it('배율 적용 — 수량 반올림·크리 2배', () => {
    const r = { kind: 'both' as const, boxes: { weapon: 3, armor: 1, accessory: 0 }, diamond: 100 };
    const m = applyMultiplier(r, 2700); // +27%
    expect(m.diamond).toBe(127);
    expect(m.boxes).toEqual({ weapon: 4, armor: 1, accessory: 0 }); // 0은 0 유지
    const c = applyCrit(m);
    expect(c.diamond).toBe(254);
    expect(c.boxes!.weapon).toBe(8);
  });
  it('구행 final_reward의 xp 필드는 배율·대성공 결과에 실리지 않는다', () => {
    const legacy = { kind: 'dia' as const, diamond: 100, xp: 22 } as { kind: 'dia'; diamond: number };
    expect('xp' in applyMultiplier(legacy, 0)).toBe(false);
    expect('xp' in applyCrit(legacy)).toBe(false);
  });
  it('대성공 확률 — 기본 5% + 합산 1,000당 1%p(상한 20%p), 레벨 항 없음', () => {
    expect(critBp(0)).toBe(500);
    expect(critBp()).toBe(500);
    expect(critBp(1000)).toBe(600);
    expect(critBp(12439)).toBe(500 + 1243);
    expect(critBp(100000)).toBe(500 + 2000); // 총 상한 25%
  });
});

describe('expedition engine — 슬롯', () => {
  it('실효 슬롯 = 합산 강화 문턱(0/3k/6k/9k) · 상한 4', () => {
    expect(effectiveSlots(0)).toBe(1); // 1칸은 처음부터
    expect(effectiveSlots(2999)).toBe(1);
    expect(effectiveSlots(3000)).toBe(2);
    expect(effectiveSlots(5999)).toBe(2);
    expect(effectiveSlots(6000)).toBe(3);
    expect(effectiveSlots(9000)).toBe(4);
    expect(effectiveSlots(999999)).toBe(4);
  });
  it('상수 참조 무결(엔진↔밸런스)', () => {
    expect(EXPEDITION_HOURS).toBe(8);
    expect(EXPEDITION_REGIONS.length).toBe(6);
  });
});
