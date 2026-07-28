import { describe, expect, it } from 'vitest';

import {
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_TOTAL_MAX,
  RAID_ATTR_COEF,
  RAID_BOSS_REGION,
  attrAdvantagePct,
  computeRaidDamage,
  raidAttrAdvantagePct,
} from '@/lib/game/balance';
import { simulateMelee } from '@/lib/game/melee/simulate';
import { simulateConquest } from '@/lib/game/guild/conquest/simulate';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import {
  attrRegionOfCatalogRegion,
  attrRegionOfItemKey,
} from '@/lib/game/attr/item-region';

describe('§10 전투 반영 — 레이드 상성', () => {
  it('보스 6종 전부 지역이 매핑돼 있다', () => {
    for (const code of [
      'slime_king',
      'orc_chief',
      'stone_golem',
      'dragon_west',
      'fallen_angel',
      'gold_griffin',
    ]) {
      expect(RAID_BOSS_REGION[code]).toBeDefined();
    }
    expect(RAID_BOSS_REGION.gold_griffin).toBe('kingdom');
  });

  it('보스를 잡는 지역 몰빵이면 +75%(=150 × ½)', () => {
    // 천사는 왕국을 잡는다 → 왕국 보스(그리핀) 상대로 최대 보정.
    const adv = raidAttrAdvantagePct({ angel: AVATAR_ATTR_TOTAL_MAX }, 'gold_griffin');
    expect(adv).toBeCloseTo(AVATAR_ATTR_TOTAL_MAX * RAID_ATTR_COEF, 6);
    expect(adv).toBeCloseTo(75, 6);
  });

  it('보스 지역과 무관한 속성이면 보정 0', () => {
    // 오크는 늪을 잡는다 → 왕국 보스와 무관.
    expect(raidAttrAdvantagePct({ orc: 150 }, 'gold_griffin')).toBe(0);
  });

  it('미등록 보스 코드는 0(무보정)', () => {
    expect(raidAttrAdvantagePct({ angel: 150 }, 'unknown_boss')).toBe(0);
  });

  it('레이드 데미지에 보정이 곱해진다', () => {
    const base = computeRaidDamage(10_000, 1, false, 0);
    const buffed = computeRaidDamage(10_000, 1, false, 75);
    expect(buffed).toBe(Math.round(base * 1.75));
  });
});

describe('§10 전투 반영 — 대난투/점령전 시뮬', () => {
  const P = (userId: string, cp: number, attrs?: Record<string, number>) => ({
    userId,
    nickname: userId,
    cp,
    attrs,
  });

  it('대난투: 속성이 없으면 기존 결과와 동일(회귀 방어)', () => {
    const plain = simulateMelee([P('a', 1000), P('b', 1000), P('c', 1000)], 'seed-1');
    const withEmpty = simulateMelee(
      [P('a', 1000, {}), P('b', 1000, {}), P('c', 1000, {})],
      'seed-1',
    );
    expect(withEmpty.championUserId).toBe(plain.championUserId);
    expect(withEmpty.totalRounds).toBe(plain.totalRounds);
  });

  it('대난투: 상성 보정이 데미지를 키운다(같은 시드·같은 CP)', () => {
    // a(천사150) → b(왕국150) 상대로 +150%. 반대로 b는 a에게 0.
    const buffed = simulateMelee(
      [P('a', 1000, { angel: 150 }), P('b', 1000, { kingdom: 150 })],
      'seed-2',
    );
    const plain = simulateMelee([P('a', 1000), P('b', 1000)], 'seed-2');
    // 보정 덕에 더 빨리 끝난다(라운드 수 감소 또는 동일).
    expect(buffed.totalRounds).toBeLessThanOrEqual(plain.totalRounds);
    // a가 압도적으로 유리하므로 챔피언은 a.
    expect(buffed.championUserId).toBe('a');
  });

  it('점령전: 유닛 attrs 미지정이어도 동작(하위호환)', () => {
    const units = [
      { userId: 'x', nickname: 'x', guildId: 'g1', guildName: 'G1', effCp: 800 },
      { userId: 'y', nickname: 'y', guildId: 'g2', guildName: 'G2', effCp: 800 },
    ];
    const r = simulateConquest(units, 'z-1');
    expect(['g1', 'g2']).toContain(r.winnerGuildId);
  });

  it('점령전: 상성 우위 길드가 이긴다(동일 CP·동일 시드)', () => {
    const units = [
      {
        userId: 'x',
        nickname: 'x',
        guildId: 'g1',
        guildName: 'G1',
        effCp: 800,
        attrs: { angel: 150 },
      },
      {
        userId: 'y',
        nickname: 'y',
        guildId: 'g2',
        guildName: 'G2',
        effCp: 800,
        attrs: { kingdom: 150 },
      },
    ];
    expect(simulateConquest(units, 'z-2').winnerGuildId).toBe('g1');
  });

  it('상성 공식과 시뮬 배수가 같은 값을 쓴다', () => {
    // 천사 150 vs 왕국 150 → +150%.
    expect(attrAdvantagePct({ angel: 150 }, { kingdom: 150 })).toBeCloseTo(150, 6);
  });
});

describe('§10 아이템 지역 → 속성 지역 매핑', () => {
  it('카탈로그 전 아이템이 매핑되거나 명시적 none(일반)이다', () => {
    for (const it of CATALOG_ITEMS) {
      const r = attrRegionOfItemKey(it.key);
      if (r === null) expect(it.region).toBe('일반');
      else expect(AVATAR_ATTR_REGIONS).toContain(r);
    }
  });

  it('세계관 세부 지역이 6지역으로 흡수된다', () => {
    expect(attrRegionOfCatalogRegion('서쪽 화산')).toBe('volcano');
    expect(attrRegionOfCatalogRegion('고대 룬 산맥')).toBe('temple');
    expect(attrRegionOfCatalogRegion('타락천사')).toBe('angel');
    expect(attrRegionOfCatalogRegion('오크 부락')).toBe('orc');
    expect(attrRegionOfCatalogRegion('일반')).toBeNull();
    expect(attrRegionOfItemKey('없는키')).toBeNull();
  });
});
