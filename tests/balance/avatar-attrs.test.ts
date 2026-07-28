import { describe, expect, it } from 'vitest';

import {
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  AVATAR_ATTR_TOTAL_MAX,
  attrAdvantagePct,
  attrDisplayVector,
  attrPrey,
  rollAvatarAttrs,
} from '@/lib/game/balance';

/**
 * §10 아바타 속성 — 상성 사이클·롤 범위·공격 보정 수식(2026-07-28 확정 스펙 1:1).
 *  - 표기: 부위당 0~50 정수 균등, 총 최대 150 = 잠재 공격 보정 +150%
 *  - 발동 = 내 표기 × (상대 먹잇감 표기 ÷ 150) — 분모 150 고정(A안)
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
  it('상수 정합 — 부위 상한 50 · 총합 150', () => {
    expect(AVATAR_ATTR_ROLL_MAX).toBe(50);
    expect(AVATAR_ATTR_TOTAL_MAX).toBe(150);
  });

  it('지역은 아이템이 정하고 수치만 롤(0~50 정수)', () => {
    const items = { weapon: 'kingdom', armor: 'volcano', accessory: 'temple' } as const;
    for (let i = 0; i < 200; i++) {
      const attrs = rollAvatarAttrs(items);
      expect(attrs.map((a) => a.slot)).toEqual(['weapon', 'armor', 'accessory']);
      expect(attrs.map((a) => a.region)).toEqual(['kingdom', 'volcano', 'temple']);
      for (const a of attrs) {
        expect(AVATAR_ATTR_REGIONS).toContain(a.region);
        expect(Number.isInteger(a.pct)).toBe(true);
        expect(a.pct).toBeGreaterThanOrEqual(0);
        expect(a.pct).toBeLessThanOrEqual(AVATAR_ATTR_ROLL_MAX);
      }
    }
  });

  it('지역 없는 아이템(일반)·미착용 부위는 각인되지 않는다', () => {
    const attrs = rollAvatarAttrs({ weapon: 'orc', armor: null, accessory: undefined });
    expect(attrs).toHaveLength(1);
    expect(attrs[0]!.slot).toBe('weapon');
    expect(attrs[0]!.region).toBe('orc');

    expect(rollAvatarAttrs({})).toHaveLength(0);
  });

  it('rng 경계 — 0은 0%, 1-ε는 50%(지역은 그대로)', () => {
    const items = { weapon: 'angel', armor: 'angel', accessory: 'angel' } as const;
    const lo = rollAvatarAttrs(items, () => 0);
    expect(lo.every((a) => a.region === 'angel' && a.pct === 0)).toBe(true);
    const hi = rollAvatarAttrs(items, () => 0.999999);
    expect(hi.every((a) => a.region === 'angel' && a.pct === AVATAR_ATTR_ROLL_MAX)).toBe(true);
  });
});

describe('avatar attrs — 표기 벡터·공격 보정', () => {
  it('같은 권역 합산 — 화산33+화산15+왕국50 → {volcano:48, kingdom:50}', () => {
    const v = attrDisplayVector([
      { slot: 'weapon', region: 'volcano', pct: 33 },
      { slot: 'armor', region: 'volcano', pct: 15 },
      { slot: 'accessory', region: 'kingdom', pct: 50 },
    ]);
    expect(v).toEqual({ volcano: 48, kingdom: 50 });
  });

  it('상대 몰빵이면 잠재 전부 발동 — 화산 100 vs 신전 150 → +100%', () => {
    // 화산은 신전에 강함. 상대 전체가 먹잇감(신전 150 몰빵)이라 가중 1 → 잠재 100% 전부.
    expect(attrAdvantagePct({ volcano: 100 }, { temple: 150 })).toBeCloseTo(100, 10);
  });

  it('상대가 절반만 먹잇감이면 절반 발동 — 화산 100 vs 신전75+천사50 → +50% / 상대는 0%', () => {
    const mine = { volcano: 100 } as const;
    const opp = { temple: 75, angel: 50 } as const;
    expect(attrAdvantagePct(mine, opp)).toBeCloseTo(50, 10);
    // 상대 관점: 신전→천사(내겐 천사 없음)=0, 천사→왕국(없음)=0.
    expect(attrAdvantagePct(opp, mine)).toBe(0);
  });

  it('이론 최대 — 완몰빵 vs 먹잇감 완몰빵 = +150%', () => {
    expect(attrAdvantagePct({ angel: 150 }, { kingdom: 150 })).toBeCloseTo(150, 10);
  });

  it('무관계 권역·미부여는 0 — 역상성은 상대 보정으로만 나타남', () => {
    // 화산 vs 늪: 늪→화산(상대가 강함). 내 보정 0, 상대는 최대.
    expect(attrAdvantagePct({ volcano: 150 }, { swamp: 150 })).toBe(0);
    expect(attrAdvantagePct({ swamp: 150 }, { volcano: 150 })).toBeCloseTo(150, 10);
    // 미부여.
    expect(attrAdvantagePct({}, { temple: 150 })).toBe(0);
    expect(attrAdvantagePct({ volcano: 150 }, {})).toBe(0);
  });
});
