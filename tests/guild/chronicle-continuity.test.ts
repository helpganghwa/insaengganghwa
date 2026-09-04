import { describe, expect, it } from 'vitest';

import { continuityFacts, type ConquestDaySummary } from '@/lib/game/guild/conquest/chronicle';

/** 연속성 사실(2026-09-04) — 어제/오늘 정리 대조로 코드가 확정하는 '하루 만의 탈환·상실·수성'. 순수 함수. */
function day(partial: Partial<ConquestDaySummary>): ConquestDaySummary {
  return {
    kstDay: '2026-09-04',
    battleCount: 0,
    captures: [],
    defenses: [],
    standings: [],
    attacks: [],
    feats: [],
    disbands: [],
    neutralized: [],
    abandoned: [],
    renames: [],
    ...partial,
  } as ConquestDaySummary;
}
const cap = (zone: string, winner: string, from: string | null, defenders = 0) => ({
  zone,
  region: 'swamp',
  winner,
  from,
  firstCapture: false,
  defenders,
});

describe('continuityFacts — 어제와 이어지는 사실', () => {
  it('어제 A가 B에게서 빼앗은 구역을 오늘 B가 되찾으면 하루 만의 탈환', () => {
    const y = day({ captures: [cap('점액 못', '티모집사', '왕실', 1)] });
    const t = day({ captures: [cap('점액 못', '왕실', '티모집사')] });
    const out = continuityFacts(t, y);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('하루 만의 탈환');
    expect(out[0]).toContain('「왕실」');
  });

  it('어제 얻은 땅을 오늘 제3자에게 잃으면 상실(탈환 아님)', () => {
    const y = day({ captures: [cap('불탄 마을', '프로미스나인', null)] });
    const t = day({ captures: [cap('불탄 마을', '게이들', '프로미스나인')] });
    const out = continuityFacts(t, y);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('하루 만에 「게이들」 에게 잃음');
    expect(out[0]).not.toContain('탈환');
  });

  it('어제 얻은 땅을 오늘 지켜내면 수성 + 공격 측 병기, 무관한 구역은 없음', () => {
    const y = day({ captures: [cap('그을린 고목', '게이들', null)] });
    const t = day({
      defenses: [{ zone: '그을린 고목', region: 'volcano', owner: '게이들' }],
      attacks: [
        { zone: '그을린 고목', region: 'volcano', guild: '민초' },
        { zone: '그을린 고목', region: 'volcano', guild: '케케케' },
        { zone: '오크 대요새', region: 'orc', guild: 'QWER' },
      ],
    });
    const out = continuityFacts(t, y);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('어제 손에 넣은 땅을 오늘 지켜냄');
    expect(out[0]).toContain('「민초」, 「케케케」');
  });

  it('어제 기록이 없으면 빈 배열', () => {
    expect(continuityFacts(day({ captures: [cap('a', 'X', 'Y')] }), day({}))).toEqual([]);
  });
});
