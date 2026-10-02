import { describe, expect, it } from 'vitest';

import { gapWord, storyHooks, sweepWord, tenureWord, type ConquestDaySummary } from '@/lib/game/guild/conquest/chronicle';
import { factIssues, type FactCheckContext } from '@/lib/game/guild/conquest/chronicle-facts';

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

describe('factIssues 28~30 — 주체 뒤바뀜·부정 표현·집행관(10-02 시험 초안 실오류)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['잊힌 숲길', '잊힌 신전'], ['검은 깃털 제단', '타락 천사 부유섬'], ['타락한 성소', '타락 천사 부유섬'], ['황금 회랑', '타락 천사 부유섬'], ['썩은 잔교', '슬라임 늪']]),
    regionLabels: ['잊힌 신전', '타락 천사 부유섬', '슬라임 늪'],
    feats: [],
    headcountZones: [],
    recaptureZones: ['검은 깃털 제단'],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map([['검은 깃털 제단', { winner: 'Winners', from: '로제' }]]),
    attackers: new Map([['잊힌 숲길', ['Winners']], ['타락한 성소', ['Slay']], ['황금 회랑', ['UNDERDOG']], ['썩은 잔교', ['케케케', '로제']]]),
    defendedBy: new Map([['잊힌 숲길', '로제'], ['타락한 성소', 'Winners'], ['황금 회랑', 'Winners'], ['썩은 잔교', 'Winners']]),
  };
  const has = (t: string, re: RegExp) => factIssues(t, c).some((i) => re.test(i));
  it('지킨 쪽·공격한 쪽을 뒤바꾸면 잡는다', () => {
    const t = '잊힌 신전의 {z|잊힌 숲길|19}에서는 {g|Winners|17}가 {g|로제|25}의 공격을 받아내며 물러서지 않았다.';
    expect(has(t, /\{z\|잊힌 숲길\} 을\(를\) 지켜 낸 길드는 \{g\|로제\}/)).toBe(true);
    expect(has(t, /\{z\|잊힌 숲길\} 을\(를\) 공격한 길드는 \{g\|Winners\}/)).toBe(true);
  });
  it('전날 점령을 오늘 다른 길드가 가져간 것처럼 쓰면 잡는다', () => {
    expect(has('부유섬에서는 {g|로제|25}가 수비를 세우지 못한 {z|검은 깃털 제단|50}을 먼저 두드려 자리를 가져갔다.', /이번에 가져간 길드는 \{g\|Winners\}/)).toBe(true);
  });
  it("'각각 A와 B의 공격'은 구역마다 짝을 맞춰 본다", () => {
    expect(has('부유섬의 {z|타락한 성소|47}와 {z|황금 회랑|49}에서는 각각 {g|Slay|39}와 {g|UNDERDOG|45}의 공격을 받아냈다.', /공격한 길드는/)).toBe(false);
    expect(has('{z|타락한 성소|47}에서는 각각 {g|민초|28}와 {g|Winners|17}가 {g|로제|25}의 공격으로부터 지켜냈다.', /\{z\|타락한 성소\} 을\(를\) 공격한 길드는 \{g\|Slay\}/)).toBe(true);
  });
  it('인물 주어·수식절은 길드 주어로 보지 않는다(옛 게시본 오탐)', () => {
    expect(has('슬라임 늪의 {z|썩은 잔교|25}에는 {g|케케케|27}와 {g|로제|25}가 하나씩 들어왔지만, {g|Winners|17}의 {u|악마|lPCpQ1MM}가 혼자 둘을 모두 쓰러뜨리고 자리를 지켰다.', /지켜 낸 길드는/)).toBe(false);
  });
  it('부정적 표현·집행관은 고쳐 쓰게 한다(가벼운 위반 아님)', () => {
    const t = '{g|로제|25}는 뼈아픈 하루를 보냈고, 집행관 혼자 맞섰다.';
    expect(has(t, /부정적 표현을 1번/)).toBe(true);
    expect(has(t, /'집행관'을 1번/)).toBe(true);
    expect(has('영토를 모두 잃었던 {g|티모집사|31}가 돌아왔다.', /부정적 표현/)).toBe(false);
  });
});
