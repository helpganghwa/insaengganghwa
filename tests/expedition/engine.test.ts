import { describe, expect, it } from 'vitest';

import {
  applyCrit,
  applyExpeditionXp,
  applyMultiplier,
  effectiveSlots,
  critBp,
  rollBoxSlots,
  rollMission,
  avatarWeightedSum,
  type Rng10k,
} from '@/lib/game/expedition/engine';
import {
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_REGIONS,
  expeditionXpToNext,
} from '@/lib/game/balance';

/** 결정론 rng — 시퀀스 소진 후 0. */
const seq = (vals: number[]): Rng10k => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

describe('expedition engine — 미션 롤', () => {
  it('보상 사전 확정 — 셋 중 하나, 수량 범위·시간 스케일 반영', () => {
    // 지역 0(swamp) → 난이도 roll 0(Lv0: easy 50%) → 본상 roll 0(boxOnly 55%) → 수량 roll → 슬롯 roll들
    const m = rollMission(seq([0, 0, 0, 0, 0, 0, 0, 0]), 0);
    expect(m.region).toBe('swamp');
    expect(m.difficulty).toBe('easy');
    expect(m.durationMs).toBe(2 * 3_600_000); // easy = 2h(2026-09-01)
    expect(m.reward.kind).toBe('box');
    const total = Object.values(m.reward.boxes!).reduce((a, b) => a + b, 0);
    // easy(×2.8, 하루 1회 1회분): base 3~4 → 8~11개(roll 0 = 최소 3 → 8)
    expect(total).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThanOrEqual(11);
    // XP — 오퍼 확정 롤(마지막 rng): seq 소진 roll 0 → 2h 최소 18. 배율·대성공을 거쳐도 유지.
    expect(m.reward.xp).toBe(18);
  });

  it('Lv0 원정(grand) 출현 15% — 분포 상단 1500bp에서만 뜬다 / Lv30+에선 25%', () => {
    // Lv0 분포(2026-08-30): easy4000 normal3000 hard1500 grand1500 → roll 0..8499 비원정, 8500..9999 원정
    for (let r = 0; r < 8500; r += 137) {
      expect(rollMission(seq([0, r]), 0).difficulty).not.toBe('grand');
    }
    expect(rollMission(seq([0, 8500]), 0).difficulty).toBe('grand');
    expect(rollMission(seq([0, 9999]), 0).difficulty).toBe('grand');
    // Lv30 분포: easy1500 normal3000 hard3000 grand2500 → roll 7500 = grand
    expect(rollMission(seq([0, 7500]), 30).difficulty).toBe('grand');
    expect(rollMission(seq([0, 9999]), 30).difficulty).toBe('grand');
  });

  it('다이아 분기 — grand(×3.4) 스케일 적용', () => {
    // 난이도 roll 9999(grand, Lv30) → 본상 roll 5500..7499 = diamondOnly → 수량 min(72, 2026-08-27 ×0.6)
    const m = rollMission(seq([0, 9999, 5500, 0]), 30);
    expect(m.reward.kind).toBe('dia');
    expect(m.reward.diamond).toBe(Math.round(72 * 3.4));
  });

  it('상자 슬롯 — 부위 3종 균등 랜덤(지역 가중 폐기, 2026-08-31)', () => {
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
  it('가중 강화 합(2026-08-28) — 일치 ×1.3 / 일반 ×1.15 / 불일치 ×1', () => {
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
  it('대성공 확률 — 기본 5% + 0.1%p/Lv(상한 50) + 합산 1,000당 1%p(상한 20%p)', () => {
    expect(critBp(0)).toBe(500);
    expect(critBp(7)).toBe(570);
    expect(critBp(99)).toBe(1000); // 레벨 상한 50
    expect(critBp(0, 1000)).toBe(600);
    expect(critBp(0, 12439)).toBe(500 + 1243);
    expect(critBp(50, 100000)).toBe(500 + 500 + 2000); // 총 상한 30%
  });
});

describe('expedition engine — 레벨/슬롯', () => {
  it('XP 가산·연쇄 레벨업·잔여 XP 규약', () => {
    const r = applyExpeditionXp(0, 0n, 24 + 24 + 24); // 72h
    // Lv0→1 30 / Lv1→2 32 → 72-62=10 잔여, Lv2
    expect(r.level).toBe(2);
    expect(r.xp).toBe(10n);
  });
  it('만렙에서 더 오르지 않는다', () => {
    const r = applyExpeditionXp(EXPEDITION_LEVEL_MAX, 0n, 1000);
    expect(r.level).toBe(EXPEDITION_LEVEL_MAX);
  });
  it('실효 슬롯 = 합산 강화 문턱(1k/3k/10k/15k) · 상한 4 · 미달 0', () => {
    expect(effectiveSlots(0)).toBe(1); // 1칸은 처음부터(2026-08-29)
    expect(effectiveSlots(2999)).toBe(1);
    expect(effectiveSlots(3000)).toBe(2);
    expect(effectiveSlots(5999)).toBe(2);
    expect(effectiveSlots(6000)).toBe(3);
    expect(effectiveSlots(9000)).toBe(4);
    expect(effectiveSlots(999999)).toBe(4);
  });
  it('레벨 곡선 참조 무결(엔진↔밸런스)', () => {
    expect(expeditionXpToNext(0)).toBe(30);
    expect(Object.keys(EXPEDITION_DIFFICULTY_HOURS).length).toBe(4);
    expect(EXPEDITION_REGIONS.length).toBe(6);
  });
});
