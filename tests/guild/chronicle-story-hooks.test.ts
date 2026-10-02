import { describe, expect, it } from 'vitest';

import { gapWord, storyHooks, sweepWord, tenureWord, type ConquestDaySummary } from '@/lib/game/guild/conquest/chronicle';

/** 10-02 점령전 모양 — 로제가 감시 망루(점령)와 모닥불 평원(막힘)에 여섯씩, 얼음 여울은 한 명이 빼앗음. */
const day: ConquestDaySummary = {
  kstDay: '2026-10-02',
  battleCount: 23,
  captures: [
    { zone: '감시 망루', region: '오크 부락', winner: '로제', from: 'Winners', firstCapture: false, defenders: 1, deployedDefenders: 0 },
    { zone: '얼음 여울', region: '잊힌 신전', winner: '로제', from: '레지스탕스', firstCapture: false, defenders: 2, deployedDefenders: 2 },
    { zone: '검은 첨봉', region: '드래곤 화산', winner: '케케케', from: '로제', firstCapture: false, defenders: 0, deployedDefenders: 0 },
    { zone: '침묵의 회랑', region: '잊힌 신전', winner: '케케케', from: 'Winners', firstCapture: false, defenders: 0, deployedDefenders: 0 },
    { zone: '늪지 오두막', region: '슬라임 늪', winner: '케케케', from: '로제', firstCapture: false, defenders: 0, deployedDefenders: 0 },
    { zone: '썩은 잔교', region: '슬라임 늪', winner: '케케케', from: 'Winners', firstCapture: false, defenders: 0, deployedDefenders: 0 },
  ],
  defenses: [],
  standings: [],
  attacks: ['얼음 여울', '뼈 토템 언덕', '용의 해골', '감시 망루', '모닥불 평원', '점액 못', '연기 평원'].map((zone) => ({ zone, region: '오크 부락', guild: '로제' })),
  disbands: [],
  neutralized: [],
  renames: [],
  abandoned: [],
  feats: [],
  underdogDefenses: [{ zone: '모닥불 평원', region: '오크 부락', owner: 'Winners', defenders: 1, attackers: [{ guild: '로제', n: 6 }], attackerTotal: 6 }],
  underdogCaptures: [{ zone: '얼음 여울', region: '잊힌 신전', winner: '로제', from: '레지스탕스', attackers: 1, defenders: 2 }],
  crowds: [{ zone: '감시 망루', region: '오크 부락', owner: 'Winners', defenders: 1, attackers: [{ guild: '로제', n: 6 }], total: 7, held: false }],
};

describe('storyHooks — 이야깃거리(10-02)', () => {
  const hooks = storyHooks(day, [
    { region: '왕국', guild: 'Winners' },
    { region: '타락 천사 부유섬', guild: 'Winners' },
  ]);
  it('같은 인원으로 나선 두 곳의 결말이 갈리면 짚는다', () => {
    expect(hooks.some((h) => h.includes('같은 인원, 엇갈린 결말') && h.includes('「감시 망루」') && h.includes('「모닥불 평원」') && h.includes('6명씩'))).toBe(true);
  });
  it('가장 많은 곳으로 공격한 길드·가장 넓게 뻗은 길드·여러 지역 석권·한 사람의 점령', () => {
    expect(hooks.some((h) => h.includes('공세의 중심') && h.includes('「로제」') && h.includes('7곳'))).toBe(true);
    expect(hooks.some((h) => h.includes('가장 넓게 발을 뻗은') && h.includes('「케케케」') && h.includes('4곳'))).toBe(true);
    expect(hooks.some((h) => h.includes('여러 지역을 함께 덮은') && h.includes('왕국·타락 천사 부유섬'))).toBe(true);
    expect(hooks.some((h) => h.includes('단 한 사람의 점령') && h.includes('「얼음 여울」'))).toBe(true);
  });
  it('기간은 숫자 대신 은유 표현으로 준다', () => {
    expect(tenureWord(1)).toBe('갓 손에 넣은');
    expect(tenureWord(8)).toBe('한동안 지켜 온');
    expect(tenureWord(22)).toBe('오래 지켜 온');
    expect(sweepWord(15)).toBe('오래 이어 온');
    expect(gapWord(1)).toBe('하루 만에');
    expect(gapWord(2)).toBe('얼마 지나지 않아');
  });
});
