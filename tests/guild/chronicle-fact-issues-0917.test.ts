import { describe, expect, it } from 'vitest';

import { factIssues, type FactCheckContext } from '@/lib/game/guild/conquest/chronicle-facts';

/**
 * 2026-09-17 실오류 회귀 — 그날 생성본에서 운영자 점검으로 찾은 것들(사실표는 그날 프로덕션 실측값 축약).
 * 11 동시 진행에 순서('곧이어') · 12 '어제 차지했던' 귀속 · 13 지역별 수 · 14 짧은 복귀의 '오랫동안' ·
 * 15 쓰러진 인물을 지켜낸 주어로 · 16 석권 서수 · 9 '지켰다' 구간 오탐.
 */
const ZONES: [string, string][] = [
  ['대성당', '왕국'], ['상인 거리', '왕국'], ['기사 연무장', '왕국'], ['남쪽 주거지', '왕국'], ['왕성', '왕국'],
  ['불탄 마을', '드래곤 화산'], ['잿더미 폐허', '드래곤 화산'],
  ['잿빛 첨석', '오크 부락'], ['약탈자 야영지', '오크 부락'], ['뼈 토템 언덕', '오크 부락'],
  ['서리 관문', '잊힌 신전'],
  ['타락한 성소', '타락 천사 부유섬'], ['황금 회랑', '타락 천사 부유섬'],
  ['늪지 오두막', '슬라임 늪'],
];

const ctx: FactCheckContext = {
  zoneRegion: new Map(ZONES),
  regionLabels: ['왕국', '오크 부락', '슬라임 늪', '드래곤 화산', '잊힌 신전', '타락 천사 부유섬'],
  feats: [{ nickname: '전사', count: 3 }, { nickname: '여왕', count: 2 }],
  headcountZones: ['늪지 오두막', '왕성'],
  recaptureZones: ['불탄 마을', '남쪽 주거지'],
  yesterdayZones: ['대성당', '남쪽 주거지', '불탄 마을', '서리 관문'],
  guildCounts: new Map([
    ['Winners', [8, 7, 21, 20]],
    ['로제', [5, 8, 12, 15]],
    ['케케케', [3, 0, 7, 4]],
    ['민초', [1, 0, 1, 0]],
    ['올림포스', [1, 2, 5, 6]],
    ['제국', [0, 1, 0, 1]],
  ]),
  battleZones: [],
  captureBy: new Map([
    ['대성당', { winner: 'Winners', from: '로제' }],
    ['상인 거리', { winner: 'Winners', from: '로제' }],
    ['기사 연무장', { winner: 'Winners', from: '로제' }],
    ['남쪽 주거지', { winner: 'Winners', from: '로제' }],
    ['불탄 마을', { winner: 'Winners', from: '로제' }],
    ['잿빛 첨석', { winner: '케케케', from: '제국' }],
    ['서리 관문', { winner: '케케케', from: 'LGTWINS' }],
    ['타락한 성소', { winner: '민초', from: '올림포스' }],
  ]),
  yesterdayCaptureBy: new Map([
    ['대성당', '로제'], ['남쪽 주거지', '로제'], ['불탄 마을', '로제'], ['서리 관문', 'LGTWINS'],
  ]),
  regionCounts: new Map([
    ['케케케', new Map([['오크 부락', { gain: 2, loss: 0, after: 5, before: 3 }], ['잊힌 신전', { gain: 1, loss: 0, after: 2, before: 1 }]])],
  ]),
  shortGapGuilds: ['민초'],
  fellFeats: ['전사'],
};

const has = (text: string, needle: string) => factIssues(text, ctx).some((i) => i.includes(needle));

describe('연대기 사실 검증기 — 2026-09-17 회귀', () => {
  it("11. '곧이어'로 구역 사이 순서를 만들면 잡는다", () => {
    expect(has('곧이어 {g|민초|28}까지 {z|타락한 성소|47}의 수비를 뚫고 들어왔다.', '같은 시각')).toBe(true);
    expect(has('같은 날 {g|민초|28}는 {z|타락한 성소|47}의 수비를 뚫고 들어왔다.', '같은 시각')).toBe(false);
  });

  it("12. 앞 문장 구역을 '그 땅들은 어제 차지했던'으로 묶으면 어제 차지하지 않은 구역을 짚는다", () => {
    const text =
      '{z|대성당|44}과 {z|상인 거리|42}, {z|기사 연무장|45}은 그대로 넘어갔고, {z|남쪽 주거지|46}는 뚫렸다. 그 땅들은 어제 {g|로제|25}가 차지했던 곳인데, 다시 주인이 바뀌었다.';
    const hit = factIssues(text, ctx).find((i) => i.includes('어제') && i.includes('차지한 구역이 아니다'));
    expect(hit).toBeDefined();
    expect(hit).toContain('{z|상인 거리}');
    expect(hit).toContain('{z|기사 연무장}');
    expect(hit).not.toContain('{z|대성당}');
    expect(has('그중 {z|대성당|44}은 {g|로제|25}가 어제 막 손에 넣은 곳이었다.', '차지한 구역이 아니다')).toBe(false);
  });

  it("13. 한 지역에서 늘린 수에 길드 전체 획득 수를 쓰면 잡는다", () => {
    const text = '{g|케케케|27}는 {z|잿빛 첨석|38}을 {g|제국|37}으로부터 가져가며 오크 부락에서 세 곳을 늘렸다.';
    expect(has(text, '오크 부락 지역 수')).toBe(true);
    expect(has('{g|케케케|27}는 {z|잿빛 첨석|38}을 가져가며 오크 부락에서 두 곳을 늘렸다.', '오크 부락 지역 수')).toBe(false);
  });

  it("14. 하루 비었다 돌아온 길드에 '오랫동안'을 붙이면 잡는다", () => {
    expect(has('오랫동안 영토를 갖지 못했던 {g|민초|28}는 이 한 곳으로 판도에 돌아왔다.', '긴 공백')).toBe(true);
  });

  it('15. 끝내 쓰러진 인물을 지켜낸 주어로 쓰면 잡고, 쓰러짐을 함께 쓰면 통과', () => {
    expect(has('{z|늪지 오두막|26}에서는 {u|전사|dMqJjyOl}가 셋을 쓰러뜨리며 자리를 지켜냈다.', '끝내 쓰러졌는데')).toBe(true);
    expect(
      has('{z|늪지 오두막|26}에서는 {u|전사|dMqJjyOl}가 셋을 베어 넘기고 쓰러졌고, {g|Winners|17}는 끝내 자리를 지켰다.', '끝내 쓰러졌는데'),
    ).toBe(false);
  });

  it("16. 석권에 '세 번째로 완성한' 순번을 붙이면 잡는다", () => {
    expect(has('{g|Winners|17}에게는 세 번째로 완성한 지역이다.', '순번')).toBe(true);
  });

  it("9. 뒤 구역의 '막아냈다'가 앞의 빼앗은 구역에 걸리지 않는다", () => {
    const text =
      '화산의 {z|불탄 마을|7}은 {g|Winners|17}가 도로 가져갔고, 화산의 {z|잿더미 폐허|3}에는 {g|로제|25}와 {g|민초|28}가 몰려들었지만 {g|Winners|17}가 그대로 막아냈다.';
    expect(has(text, '지켜낸 것처럼')).toBe(false);
    expect(has('{g|Winners|17}는 {z|불탄 마을|7}을 끝내 지켜냈다.', '지켜낸 것처럼')).toBe(true);
  });
});
