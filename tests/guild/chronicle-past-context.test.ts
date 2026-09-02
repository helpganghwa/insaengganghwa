import { describe, expect, it } from 'vitest';

import { findPastContextZoneKeys, parseChronicleSegments } from '@/app/(game)/guild/map/chronicle-tokens';

/** 2026-09-01 실제 연대기 서두 — 어제 회고 문장의 마커가 오늘 사건 연출을 먼저 소비하던 꼬임 회귀. */
const TEXT =
  '드래곤 화산에서는 어제 {z|잿더미 폐허|3}와 {z|불탄 마을|7}을 손에 넣었던 {g|프로미스나인|23}에게 {g|왕실|25}이 반격을 가했다. ' +
  '{g|왕실|25}은 방어 병력이 없던 {z|잿더미 폐허|3}와 {z|흑요석 보루|4}를 그대로 가져갔다. 대신 {g|프로미스나인|23}은 비어 있던 {z|재의 길목|6}을 교전 없이 접수했다.\n\n' +
  '슬라임 늪에서는 {g|왕실|25}이 {z|포자 습지|23}를 차지했다.';

describe('findPastContextZoneKeys — 과거 회고 문장의 구역 마커는 리플레이 트리거에서 제외', () => {
  it('"어제 …" 문장의 마커만 건너뛰고, 같은 구역의 뒤 언급은 남긴다', () => {
    const paras = TEXT.split(/\n{2,}/).map((p) => parseChronicleSegments(p.trim()));
    const deferred = findPastContextZoneKeys(paras);
    const zKeys = paras.flatMap((segs, p) => segs.map((s, i) => (s.kind === 'z' ? { key: `${p}:${i}`, name: s.name } : null)).filter(Boolean)) as { key: string; name: string }[];
    const names = (pred: (k: string) => boolean) => zKeys.filter((z) => pred(z.key)).map((z) => z.name);
    expect(names((k) => deferred.has(k))).toEqual(['잿더미 폐허', '불탄 마을']); // 첫 문장(어제)만
    expect(names((k) => !deferred.has(k))).toEqual(['잿더미 폐허', '흑요석 보루', '재의 길목', '포자 습지']); // 둘째 문장 이후는 트리거 유지
  });
  it('문단이 "어제 …"로 시작해도 회고 마커를 건너뛴다(문장 시작 off-by-one 회귀)', () => {
    const paras = ['어제 {z|잿더미 폐허|3}를 잃었던 {g|왕실|25}이 오늘 되찾았다. {g|왕실|25}이 {z|잿더미 폐허|3}를 차지했다.'].map((p) => parseChronicleSegments(p));
    const deferred = findPastContextZoneKeys(paras);
    expect(deferred.size).toBe(1); // 첫 문장(어제)의 마커만
  });
  it('회고 표현이 없으면 아무것도 건너뛰지 않는다', () => {
    const paras = ['{g|왕실|25}이 {z|포자 습지|23}를 차지했다. 경합에서 앞서 가져갔다.'].map((p) => parseChronicleSegments(p));
    expect(findPastContextZoneKeys(paras).size).toBe(0);
  });
});
