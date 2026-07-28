import { describe, expect, it } from 'vitest';

import {
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  attrAdvantagePct,
  attrDisplayVector,
  attrPrey,
  rollAvatarAttrs,
} from '@/lib/game/balance';

/**
 * §10 아바타 속성 — 상성 사이클·롤 범위·공격 보정 수식(2026-07-28 확정 스펙 1:1).
 * 확률 공시 대상이라 수식·범위 회귀는 법적 리스크(§33) — 스펙 변경 시 공시도 함께.
 */
describe('avatar attrs — 상성 사이클', () => {
  it('확정 사이클: 천사→왕국→오크→늪→화산→신전→천사', () => {
    expect(attrPrey('angel')).toBe('kingdom');
    expect(attrPrey('kingdom')).toBe('orc');
    expect(attrPrey('orc')).toBe('swamp');
    expect(attrPrey('swamp')).toBe('volcano');
    expect(attrPrey('volcano')).toBe('temple');
    expect(attrPrey('temple')).toBe('angel'); // 꼬리물기 닫힘
  });
});

describe('avatar attrs — 생성 롤', () => {
  it('3부위(무/방/장) · 권역 유효 · 표기 0~100 정수', () => {
    for (let i = 0; i < 200; i++) {
      const attrs = rollAvatarAttrs();
      expect(attrs.map((a) => a.slot)).toEqual(['weapon', 'armor', 'accessory']);
      for (const a of attrs) {
        expect(AVATAR_ATTR_REGIONS).toContain(a.region);
        expect(Number.isInteger(a.pct)).toBe(true);
        expect(a.pct).toBeGreaterThanOrEqual(0);
        expect(a.pct).toBeLessThanOrEqual(AVATAR_ATTR_ROLL_MAX);
      }
    }
  });

  it('rng 경계 — 0은 최소, 1-ε는 최대(권역 마지막·표기 100)', () => {
    const lo = rollAvatarAttrs(() => 0);
    expect(lo.every((a) => a.region === 'angel' && a.pct === 0)).toBe(true);
    const hi = rollAvatarAttrs(() => 0.999999);
    expect(hi.every((a) => a.region === 'temple' && a.pct === AVATAR_ATTR_ROLL_MAX)).toBe(true);
  });
});

describe('avatar attrs — 표기 벡터·공격 보정', () => {
  it('같은 권역 합산 — 화산66+화산30+왕국100 → {volcano:96, kingdom:100}', () => {
    const v = attrDisplayVector([
      { slot: 'weapon', region: 'volcano', pct: 66 },
      { slot: 'armor', region: 'volcano', pct: 30 },
      { slot: 'accessory', region: 'kingdom', pct: 100 },
    ]);
    expect(v).toEqual({ volcano: 96, kingdom: 100 });
  });

  it('기획 예시 — 내 화산 200표기 vs 상대 신전 몰빵(300) → +20%', () => {
    // 화산은 신전에 강함. 상대 전체가 먹잇감(신전)이라 가중 1 → 20% 전부 발동.
    const adv = attrAdvantagePct({ volcano: 200 }, { temple: 300 });
    expect(adv).toBeCloseTo(20, 10);
  });

  it('상대가 반만 먹잇감이면 절반 발동 — 화산 200 vs 신전150+천사150 → +10% / 상대는 0%', () => {
    const mine = { volcano: 200 } as const;
    const opp = { temple: 150, angel: 150 } as const;
    expect(attrAdvantagePct(mine, opp)).toBeCloseTo(10, 10);
    // 상대 관점: 신전→천사(내겐 천사 없음)=0, 천사→왕국(없음)=0.
    expect(attrAdvantagePct(opp, mine)).toBe(0);
  });

  it('상한 — 표기 300 몰빵 vs 먹잇감 몰빵 = 최대 30%', () => {
    expect(attrAdvantagePct({ angel: 300 }, { kingdom: 300 })).toBeCloseTo(30, 10);
  });

  it('무관계 권역·미부여는 0 — 역상성은 상대 보정으로만 나타남', () => {
    // 화산 vs 늪: 늪→화산(상대가 강함). 내 보정 0, 상대는 최대.
    expect(attrAdvantagePct({ volcano: 300 }, { swamp: 300 })).toBe(0);
    expect(attrAdvantagePct({ swamp: 300 }, { volcano: 300 })).toBeCloseTo(30, 10);
    // 미부여.
    expect(attrAdvantagePct({}, { temple: 300 })).toBe(0);
    expect(attrAdvantagePct({ volcano: 300 }, {})).toBe(0);
  });
});
