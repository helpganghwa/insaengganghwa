import { describe, expect, it } from 'vitest';

import { factIssues, type FactCheckContext } from '@/lib/game/guild/conquest/chronicle-facts';
import { insertQuietParagraph, isLightFactIssue } from '@/lib/game/guild/conquest/chronicle';

/**
 * 10-11 운영자 교정 분석 반영 — 9일 치(10-03~10-11) 생성본은 보유 기간 꾸밈말 5~10회, '쓰러뜨리다' 3~5회,
 * 도입은 아홉 편 모두 규모 문장이었고 게시본은 날마다 그것을 고쳤다(수정률 38~78%). 검사 43·44·45와
 * 복귀 검사(14)의 절 단위 보정, '다음을 기약' 알림, 규모 문장으로 시작하는 정산 문단 앞 묶음 문단 삽입.
 */
const base: FactCheckContext = {
  zoneRegion: new Map(),
  regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
  feats: [],
  headcountZones: [],
  recaptureZones: [],
  yesterdayZones: [],
  guildCounts: new Map(),
  battleZones: [],
  captureBy: new Map(),
};
const only = (issues: string[], key: string) => issues.filter((i) => i.includes(key));

describe('14 — 복귀 공백은 절 단위로 귀속', () => {
  const ctx = { ...base, shortGapGuilds: ['민초'] };
  it('다른 길드의 오랜만에가 같은 문장에 있어도 민초를 잡지 않는다(10-11 게시본 오탐)', () => {
    const text = '영토를 모두 내주었던 {g|민초|28}는 곧바로 돌아와 한 곳을 쥐었고, 오랜만에 돌아온 {g|레지스탕스|36}는 한 곳을 쥐게 되었다.';
    expect(only(factIssues(text, ctx), '며칠 만에 돌아왔는데')).toEqual([]);
  });
  it('같은 절에 민초가 있으면 잡는다', () => {
    const text = '오랜만에 돌아온 {g|민초|28}와 {g|레지스탕스|36}는 각각 한 곳을 쥐게 되었다.';
    const got = only(factIssues(text, ctx), '며칠 만에 돌아왔는데');
    expect(got).toHaveLength(1);
    expect(got[0]).toContain('{g|민초}');
  });
});

describe('43 — 보유 기간·연속성 꾸밈말 총량', () => {
  const three =
    '{g|로제|25}는 {g|Winners|17}가 오래 지켜 온 {z|잿더미 폐허|3}를 가져갔다. {g|Winners|17}는 갓 얻은 {z|대설봉|12}을 내주지 않았다. {g|탕후루|43}는 어제 막 차지한 땅을 하루 만에 내주었다.';
  it('세 번까지는 통과', () => {
    expect(only(factIssues(three, base), '꾸밈말')).toEqual([]);
  });
  it('네 번째부터 문장을 들어 잡는다(가벼운 위반 아님)', () => {
    const four = `${three} {g|민초|28}는 한동안 비워 둔 {z|버섯 군락|21}을 차지했다.`;
    const got = only(factIssues(four, base), '꾸밈말');
    expect(got).toHaveLength(1);
    expect(got[0]).toContain('4번');
    expect(got[0]).toContain('「');
    expect(isLightFactIssue(got[0]!)).toBe(false);
  });
});

describe('44 — 쓰러뜨리다 되풀이', () => {
  const two = '{g|Winners|17}의 수비가 공격자를 쓰러뜨렸다. {g|로제|25}의 수비도 공격자를 쓰러뜨렸다.';
  it('두 장면까지는 통과', () => {
    expect(only(factIssues(two, base), '쓰러뜨리다')).toEqual([]);
  });
  it('세 번째부터 잡는다(가벼운 위반 아님)', () => {
    const got = only(factIssues(`${two} {g|민초|28}의 수비까지 공격자를 쓰러뜨렸다.`, base), '쓰러뜨리다');
    expect(got).toHaveLength(1);
    expect(got[0]).toContain('3번');
    expect(isLightFactIssue(got[0]!)).toBe(false);
  });
});

describe('45 — 도입 되풀이', () => {
  const ctx = {
    ...base,
    recentOpenings: [
      '이번 점령전에서는 스물한 곳에서 싸움이 벌어져 그중 일곱 곳의 주인이 바뀌었다.',
      '오늘 점령전에서 가장 많은 사람이 몰린 곳은 오크 부락의 전사의 막사였다.',
    ],
  };
  it('규모 문장으로 열면 잡는다(수사가 달라도 같은 틀)', () => {
    const got = only(factIssues('이번 점령전에서는 열다섯 곳에서 싸움이 벌어졌고, 그중 일곱 곳의 주인이 바뀌었다. {g|로제|25}가 {z|점액 못|28}을 차지했다.', ctx), '같은 틀');
    expect(got).toHaveLength(1);
    expect(isLightFactIssue(got[0]!)).toBe(false);
  });
  it('최다 인원 틀도 잡는다', () => {
    expect(only(factIssues('드래곤 화산의 {z|잿더미 폐허|3}에 이날 가장 많은 열여덟 명이 모였다.', ctx), '같은 틀')).toHaveLength(1);
  });
  it('장면으로 열면 통과', () => {
    expect(only(factIssues('잊힌 신전의 {z|대설봉|12}에 {g|Winners|17}의 공격이 들어가 땅을 차지했다.', ctx), '같은 틀')).toEqual([]);
  });
  it('최근 도입이 없으면 검사 생략', () => {
    expect(only(factIssues('이번 점령전에서는 열다섯 곳에서 싸움이 벌어졌다.', base), '같은 틀')).toEqual([]);
  });
});

describe("'다음을 기약'은 가벼운 알림", () => {
  it('인물 이름과 겹치는 표현을 알린다', () => {
    const got = only(factIssues('{g|탕후루|43}는 이번에는 판도에서 물러나 다음을 기약하게 되었다.', base), '다음을 기약');
    expect(got).toHaveLength(1);
    expect(isLightFactIssue(got[0]!)).toBe(true);
  });
});

describe('묶음 문단 — 규모 문장으로 시작하는 정산 문단 앞에', () => {
  it('정산 문단이 규모 문장으로 열려도 그 앞에 끼운다', () => {
    const text = '{g|로제|25}가 {z|점액 못|28}을 차지했다.\n\n이번 점령전에서는 열다섯 곳에서 싸움이 벌어져 일곱 곳의 주인이 바뀌었다. 이번 점령전으로 {g|로제|25}는 세 곳을 얻었다.';
    const out = insertQuietParagraph(text, [{ owner: 'Winners', zone: '상인 거리', region: '왕국', attacker: 'Slay' }], '2026-10-11');
    const paras = out.split(/\n\n+/);
    expect(paras).toHaveLength(3);
    expect(paras[1]).toContain('{z|상인 거리}');
    expect(paras[2]!.startsWith('이번 점령전에서는')).toBe(true);
  });
});
