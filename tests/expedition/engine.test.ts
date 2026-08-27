import { describe, expect, it } from 'vitest';

import {
  applyCrit,
  applyExpeditionXp,
  applyMultiplier,
  effectiveSlots,
  critBp,
  rollBoxSlots,
  rollMission,
  synergyBpForSnapshot,
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
    expect(m.durationMs).toBe(4 * 3_600_000);
    expect(m.reward.kind).toBe('box');
    const total = Object.values(m.reward.boxes!).reduce((a, b) => a + b, 0);
    // easy(×0.55): base 4~6 → 2~3개(최소 1 보장)
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(3);
  });

  it('Lv0에서는 원정(grand)이 절대 안 뜬다 / Lv30+에선 뜬다', () => {
    for (let r = 0; r < 10000; r += 137) {
      expect(rollMission(seq([0, r]), 0).difficulty).not.toBe('grand');
    }
    // Lv30 분포: easy1500 normal3000 hard3000 grand2500 → roll 9999 = grand
    expect(rollMission(seq([0, 9999]), 30).difficulty).toBe('grand');
  });

  it('다이아 분기 — grand(×3.4) 스케일 적용', () => {
    // 난이도 roll 9999(grand, Lv30) → 본상 roll 5500..7499 = diamondOnly → 수량 min(72, 2026-08-27 ×0.6)
    const m = rollMission(seq([0, 9999, 5500, 0]), 30);
    expect(m.reward.kind).toBe('dia');
    expect(m.reward.diamond).toBe(Math.round(72 * 3.4));
  });

  it('상자 슬롯 가중 — 주력 슬롯이 우세(대수 검증)', () => {
    let i = 7;
    const rng: Rng10k = () => (i = (i * 9301 + 49297) % 10000);
    const acc = rollBoxSlots(rng, 'volcano', 3000); // 화산=무기 60%
    expect(acc.weapon).toBeGreaterThan(acc.armor);
    expect(acc.weapon).toBeGreaterThan(acc.accessory);
    expect(acc.weapon + acc.armor + acc.accessory).toBe(3000);
    expect(acc.weapon / 3000).toBeGreaterThan(0.55);
    expect(acc.weapon / 3000).toBeLessThan(0.65);
  });
});

describe('expedition engine — 시너지·배율', () => {
  const snap = {
    weaponKey: 'volcano_dancer_daggers', // 화산
    armorKey: 'general_twin_flintlocks', // 일반(슬롯은 무관 — 지역만 본다)
    accessoryKey: 'orc_hunter_boomerang', // 오크 부락
  };
  it('배정 아바타 스냅샷 기준 — 일치 +10%/일반 +5%/불일치 0', () => {
    expect(synergyBpForSnapshot(snap, 'volcano')).toBe(1000 + 500); // 화산 일치 + 일반
    expect(synergyBpForSnapshot(snap, 'orc')).toBe(1000 + 500); // 오크 일치 + 일반
    expect(synergyBpForSnapshot(snap, 'swamp')).toBe(500); // 일반만
    expect(synergyBpForSnapshot(null, 'swamp')).toBe(0);
    expect(synergyBpForSnapshot({ a: 'no_such_key' }, 'swamp')).toBe(0);
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
  it('파견 레벨 → 대성공 확률 — 10% + 0.1%p/Lv, 상한 Lv.50=15%', () => {
    expect(critBp(0)).toBe(1000);
    expect(critBp(7)).toBe(1070);
    expect(critBp(99)).toBe(1500);
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
  it('실효 슬롯 = max(구매, 레벨 해금) · 상한 3', () => {
    expect(effectiveSlots(0, 1)).toBe(1);
    expect(effectiveSlots(9, 1)).toBe(1);
    expect(effectiveSlots(10, 1)).toBe(2);
    expect(effectiveSlots(30, 1)).toBe(3);
    expect(effectiveSlots(0, 3)).toBe(3);
    expect(effectiveSlots(50, 99)).toBe(3);
  });
  it('레벨 곡선 참조 무결(엔진↔밸런스)', () => {
    expect(expeditionXpToNext(0)).toBe(30);
    expect(Object.keys(EXPEDITION_DIFFICULTY_HOURS).length).toBe(4);
    expect(EXPEDITION_REGIONS.length).toBe(6);
  });
});
