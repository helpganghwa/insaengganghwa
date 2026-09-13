import { describe, expect, it } from 'vitest';

import { factIssues, type FactCheckContext } from '@/lib/game/guild/conquest/chronicle-facts';

/**
 * 2026-09-13 실오류 회귀 — 그날 생성본에서 운영자가 손으로 고친 것들.
 *
 * 세 가지가 매번 새는 자리였다:
 *  8. 전투가 있었는데 본문에 아예 안 나온 구역(그날 19전투 중 3곳이 통째로 사라졌다)
 *  9. 빼앗은 구역을 '지켰다'로 쓴 주체 혼동(케케케는 감시 망루의 공격 측이었다)
 * 10. 소유권 이동에서 한쪽 길드가 빠져 마지막 집계의 증감이 본문에서 따라지지 않음
 *
 * 사실표는 그날 aggregateConquestDay(2026-09-13, server 1) 실측값.
 */
const ZONES: [string, string][] = [
  ['썩은 잔교', '슬라임 늪'], ['고사목 숲', '슬라임 늪'], ['형광 수렁', '슬라임 늪'], ['버섯 군락', '슬라임 늪'],
  ['용의 해골', '드래곤 화산'], ['용암 하구', '드래곤 화산'], ['연기 평원', '드래곤 화산'],
  ['잿더미 폐허', '드래곤 화산'], ['검은 첨봉', '드래곤 화산'],
  ['변경 초소', '오크 부락'], ['약탈자 야영지', '오크 부락'], ['감시 망루', '오크 부락'],
  ['붉은 막사', '오크 부락'], ['모닥불 평원', '오크 부락'],
  ['설원 신전', '잊힌 신전'], ['왕성', '왕국'],
  ['타락의 심연', '타락 천사 부유섬'], ['황금 회랑', '타락 천사 부유섬'], ['검은 깃털 제단', '타락 천사 부유섬'],
];

const ctx: FactCheckContext = {
  zoneRegion: new Map(ZONES),
  regionLabels: ['왕국', '오크 부락', '슬라임 늪', '드래곤 화산', '잊힌 신전', '타락 천사 부유섬'],
  feats: [{ nickname: '쩌내', count: 3 }, { nickname: '규규', count: 6 }],
  headcountZones: ['용의 해골', '썩은 잔교'],
  recaptureZones: [],
  yesterdayZones: [],
  guildCounts: new Map(),
  battleZones: ZONES.map(([z]) => z),
  captureBy: new Map([
    ['검은 첨봉', { winner: 'Winners', from: '케케케' }],
    ['잿더미 폐허', { winner: '로제', from: 'Winners' }],
    ['설원 신전', { winner: '제국', from: 'Winners' }],
    ['변경 초소', { winner: '로제', from: 'Winners' }],
    ['감시 망루', { winner: '케케케', from: '로제' }],
    ['붉은 막사', { winner: '로제', from: '구혼각' }],
    ['모닥불 평원', { winner: '제국', from: 'Winners' }],
    ['황금 회랑', { winner: '로제', from: '민초' }],
    ['검은 깃털 제단', { winner: '올림포스', from: '로제' }],
  ]),
};

describe('연대기 사실 검증기 — 2026-09-13 회귀', () => {
  it('전투가 있었는데 본문에 없는 구역을 잡는다', () => {
    const text = '{g|로제|25}가 {z|감시 망루|36}를 {g|케케케|27}에게 내주었다.';
    const hit = factIssues(text, ctx).find((i) => i.includes('한 번도 안 나온 구역'));
    expect(hit).toBeDefined();
    expect(hit).toContain('{z|왕성}');
    expect(hit).toContain('{z|타락의 심연}');
    expect(hit).toContain('{z|버섯 군락}');
  });

  it("빼앗은 구역을 '지켰다'로 쓰면 잡는다 (감시 망루)", () => {
    const text = '오크 부락의 {z|감시 망루|36}에서는 {g|올림포스|32}와 겨룬 끝에 {g|케케케|27}가 승리를 가져가며 자리를 지켰다.';
    const hit = factIssues(text, ctx).find((i) => i.includes('빼앗은') && i.includes('감시 망루'));
    expect(hit).toBeDefined();
  });

  it('소유권 이동에서 빼앗긴 길드가 같은 문단에 없으면 잡는다', () => {
    const text = '타락 천사 부유섬의 {z|검은 깃털 제단|50}은 지키는 이 없던 틈을 타 {g|올림포스|32}가 손에 넣었다.';
    const hit = factIssues(text, ctx).find((i) => i.includes('검은 깃털 제단') && i.includes('소유권 이동'));
    expect(hit).toContain('{g|로제}');
  });

  it('가져간 길드가 빠져도 잡는다 — 집계 증감이 본문에서 안 따라지던 경우', () => {
    const text = '{g|케케케|27}는 드래곤 화산의 {z|검은 첨봉|1}을 잃었다.';
    const hit = factIssues(text, ctx).find((i) => i.includes('검은 첨봉') && i.includes('소유권 이동'));
    expect(hit).toContain('{g|Winners}');
  });

  it('누가 누구에게서 가져갔는지 밝히면 통과한다', () => {
    const text = '{g|케케케|27}는 드래곤 화산의 {z|검은 첨봉|1}을 {g|Winners|17}에게 내주었다.';
    expect(factIssues(text, ctx).some((i) => i.includes('검은 첨봉') && i.includes('소유권 이동'))).toBe(false);
  });

  it("회고는 한 문장까지 — 두 문장이면 잡는다", () => {
    const text = '{z|감시 망루|36}는 어제 얻은 땅이었다. {z|검은 첨봉|1}도 어제 주인이 바뀌었다.';
    expect(factIssues(text, { ...ctx, yesterdayZones: ['감시 망루', '검은 첨봉'] })
      .some((i) => i.includes('회고 문장이 2개'))).toBe(true);
  });

  it('땅을 세는 수사는 인원수로 보지 않는다 — 오탐 2종(2026-09-13)', () => {
    // 인원수가 허용되지 않은 구역인데도, 아래 둘은 사람 이야기가 아니라 잡히면 안 된다.
    const a = '{g|올림포스|32}는 {z|검은 깃털 제단|50}을 {g|로제|25}가 비워 둔 틈에 손에 넣어, 거점 하나를 더 세웠다.';
    const b = '{g|제국|37}은 두 곳을 더해 여덟 곳, {g|케케케|27}는 하나를 얻고 하나를 잃어 세 곳 그대로가 되었다.';
    for (const t of [a, b]) expect(factIssues(t, ctx).some((i) => i.includes('사람 수 표현'))).toBe(false);
  });

  it('사람 이야기가 섞인 집계 문장은 그대로 잡는다 — 위 완화가 진짜 위반을 가리지 않게', () => {
    const t = '{g|로제|25}는 두 곳을 얻었고 {z|모닥불 평원|40}에서는 셋을 베었다.';
    expect(factIssues(t, ctx).some((i) => i.includes('사람 수 표현'))).toBe(true);
  });
});
