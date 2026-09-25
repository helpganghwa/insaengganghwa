import { describe, expect, it } from 'vitest';

import { factIssues, headlineIssues, parseZoneCounts, type FactCheckContext } from '@/lib/game/guild/conquest/chronicle-facts';
import { deRetro, isLightFactIssue, pickRetroFact } from '@/lib/game/guild/conquest/chronicle';

/**
 * 연대기 사실 검증기(2026-09-10) — 09-10 실제 생성 본문(운영자 검수에서 걸린 오류 4종 + 회고 반복)으로 회귀.
 * 사실표는 그날 aggregateConquestDay 결과에서 옮긴 값.
 */
const ctx: FactCheckContext = {
  zoneRegion: new Map([
    ['분노의 분화구', '드래곤 화산'], ['용의 해골', '드래곤 화산'], ['재의 길목', '드래곤 화산'], ['그을린 고목', '드래곤 화산'],
    ['연기 평원', '드래곤 화산'], ['검은 첨봉', '드래곤 화산'], ['고사목 숲', '슬라임 늪'], ['썩은 잔교', '슬라임 늪'],
    ['늪지 오두막', '슬라임 늪'], ['오크 대요새', '오크 부락'], ['약탈자 야영지', '오크 부락'], ['모닥불 평원', '오크 부락'],
    ['성좌의 폐허', '잊힌 신전'], ['눈 덮인 숲', '잊힌 신전'], ['서리 관문', '잊힌 신전'], ['황금 회랑', '타락 천사 부유섬'],
  ]),
  regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
  feats: [{ nickname: '뉴비', count: 3 }],
  headcountZones: ['연기 평원'],
  // 어제 잃은 길드가 오늘 노린 구역: 용의 해골(케케케는 안 노림 → 제외), 연기 평원(올림포스), 늪지 오두막(로제). 분노의 분화구는 어제 티모집사→케케케라 로제는 해당 없음.
  recaptureZones: ['연기 평원', '늪지 오두막'],
  yesterdayZones: ['분노의 분화구', '늪지 오두막', '용의 해골', '연기 평원', '타락한 성소', '용암 하구', '그을린 고목'],
  guildCounts: new Map([
    ['Winners', [5, 7, 30, 32]], ['로제', [1, 4, 11, 14]], ['케케케', [2, 3, 2, 3]], ['올림포스', [1, 1, 1, 1]],
    ['제국', [2, 0, 2, 0]], ['민초', [1, 0, 1, 0]], ['티모집사', [1, 0, 1, 0]], ['용병', [1, 0, 1, 0]], ['구혼각', [1, 0, 1, 0]],
  ]),
  // 이 묶음은 1~7번(09-10 회귀)만 본다 — 8~10번(구역 누락·주체 혼동·귀속)은 아래 09-13 묶음에서 따로 검증.
  battleZones: [],
  captureBy: new Map(),
};

const ORIGINAL = `왕실이 이름을 {g|로제|25}로 바꾼 뒤 맞은 이번 점령전은 드래곤 화산에서부터 뒤엉켰다. {g|로제|25}는 {z|분노의 분화구|2}를 다시 노렸다. 그곳은 어제 {g|케케케|27}에게 내주었던 땅이다. {g|케케케|27}는 수비수 둘을 세워 맞섰지만 끝내 밀렸고, {g|로제|25}는 하루 만에 그 땅을 되찾았다. 이 자리를 지킨 건 {u|강화의신|6rq9dTHu}이었다. {z|분노의 분화구|2} 전투에서 세 차례 밀려드는 공격을 모두 받아내며 자리를 지켜, {g|로제|25}가 되찾은 땅을 곧바로 다시 잃지 않게 만들었다.

하지만 화산의 다른 쪽에서는 {g|로제|25}가 거꾸로 무너졌다. {g|Winners|17}는 {z|용의 해골|5}을 노려 손에 넣었다. 그 땅은 어제 {g|로제|25}가 {g|케케케|27}에게서 빼앗았던 곳이다. 같은 화산에서 {g|올림포스|32}는 {z|연기 평원|10}을 다시 노렸다. 그곳은 어제 {g|케케케|27}에게 내주었던 땅이다. {g|올림포스|32}는 수비수 둘을 뚫고 하루 만에 그 땅을 되찾았고, {g|케케케|27}는 대신 {z|검은 첨봉|1}을 노려 {g|올림포스|32}의 수비 한 명을 무너뜨리며 자리를 옮겨 잡았다.

잊힌 신전에서는 {g|제국|37}이 {z|성좌의 폐허|16}를 두고 {g|민초|28}와 경합해 끝내 손에 넣었고, 같은 지역의 {z|모닥불 평원|40}도 비어 있던 채로 챙겨 오크 부락과 신전 두 곳에서 첫 깃발을 세웠다.

이 하루로 {g|Winners|17}는 다섯 곳을 얻고 일곱 곳을 내주어 서른 곳을 지켰고, 여전히 가장 넓은 영토를 지닌 세력이다.`;

const CORRECTED = `왕실이 이름을 {g|로제|25}로 바꾼 뒤 맞은 이번 점령전은 드래곤 화산에서부터 뒤엉켰다. {g|로제|25}는 {z|분노의 분화구|2}를 쳤다. 그곳은 {g|케케케|27}가 {g|티모집사|31}에게서 갓 얻은 땅이었다. {g|케케케|27}는 수비를 세워 맞섰지만 밀렸고, 분화구는 하루도 머물지 못한 채 {g|로제|25}의 손에 넘어갔다. 그러나 화산의 다른 자리에서는 {g|로제|25}가 거꾸로 무너졌다. {g|Winners|17}는 {z|용의 해골|5}을 빼앗았다. 전날 {g|로제|25}가 {g|케케케|27}에게서 가져온 땅이 곧바로 다시 주인을 바꾼 것이다. {g|Winners|17}는 {z|재의 길목|6}과 {z|그을린 고목|8}까지 밀어붙여 각각 {g|로제|25}와 {g|케케케|27}에게서 넘겨받았다.

슬라임 늪에서도 {g|Winners|17}의 기세는 이어졌다. {g|로제|25}가 지키던 {z|고사목 숲|29}과 {z|썩은 잔교|25}를 저항을 뚫고 차지해 이날에만 다섯 구역을 거두었다. {g|로제|25}는 전날 잃은 {z|늪지 오두막|26}을 되찾으려 나섰지만 {g|Winners|17}가 끝내 막아냈다. 화산으로 돌아가면, 이날 가장 많은 사람이 몰린 곳은 {z|연기 평원|10}이었다. {g|올림포스|32}의 넷이 {g|케케케|27}의 둘을 뚫고 잃었던 땅을 도로 가져갔고, {g|케케케|27}는 대신 {z|검은 첨봉|1}을 쳐서 {g|올림포스|32}의 수비를 무너뜨리고 자리를 옮겨 잡았다.

오크 부락과 잊힌 신전, 타락 천사 부유섬에서는 {g|Winners|17}가 지키지 않고 비워둔 땅들이 줄줄이 주인을 바꿨다. {g|케케케|27}는 오크 부락의 {z|오크 대요새|31}를, {g|구혼각|38}은 같은 부락의 {z|약탈자 야영지|35}를 빈 채로 넘겨받았다. 잊힌 신전의 {z|성좌의 폐허|16}에서는 {g|제국|37}과 {g|민초|28}가 빈 땅을 두고 맞붙어 {g|제국|37}이 차지했다. 이 싸움에서 {u|뉴비|qHs0ByTF}는 세 차례 공격을 받아내고 끝까지 살아남아 {g|제국|37}의 첫 깃발을 세웠다. {g|제국|37}은 오크 부락의 {z|모닥불 평원|40}까지 빈 채로 챙겨 두 지역에 발을 들였다. {g|티모집사|31}는 신전의 {z|눈 덮인 숲|11}을, {g|용병|35}은 {z|서리 관문|17}을 각각 빈 채로 손에 넣었고, {g|민초|28}는 부유섬의 {z|황금 회랑|49}을 얻어 판도에 다시 이름을 올렸다.

이 하루로 {g|Winners|17}는 다섯 곳을 얻고 일곱 곳을 내주어 서른 곳을 지켰고, 여전히 가장 넓은 영토를 가진 세력이다. {g|로제|25}는 한 곳을 얻고 네 곳을 잃어 열한 곳으로 줄었고, {g|케케케|27}는 두 곳을 얻고 세 곳을 잃어 두 곳만 남았다. {g|올림포스|32}는 한 곳을 잃고 한 곳을 되찾아 한 곳을 유지했다. {g|제국|37}과 {g|용병|35}, {g|구혼각|38}은 이번에 처음 대륙에 이름을 알렸고, {g|민초|28}와 {g|티모집사|31}는 영토를 모두 잃었던 처지에서 돌아와 각각 한두 곳씩을 손에 쥐었다.`;

describe('연대기 사실 검증기', () => {
  it('09-10 원문의 오류를 전부 잡는다 — 없는 인물·인원수 2곳·지역·재획득·회고 반복', () => {
    const issues = factIssues(ORIGINAL, ctx);
    const has = (re: RegExp) => issues.some((i) => re.test(i));
    expect(has(/개인 활약에 없는 인물 \{u\|강화의신\}/)).toBe(true);
    expect(has(/사람 수 표현\([^)]*둘을[\s\S]*수비수 둘을 세워/)).toBe(true); // 분노의 분화구
    expect(has(/사람 수 표현\(한 명\)/)).toBe(true); // 검은 첨봉
    expect(has(/\{z\|모닥불 평원\} 은\(는\) 오크 부락 지역인데 문장은 잊힌 신전/)).toBe(true);
    expect(has(/\{z\|분노의 분화구\} 은\(는\) 최근\(7일 안\) 잃은 길드가 오늘 노린 구역이 아니라/)).toBe(true);
    expect(has(/'하루 만에' 표현이 2번/)).toBe(true);
    expect(has(/'어제 … 내주었던' 표현이 2번/)).toBe(true);
    expect(has(/'다시 노렸다' 표현이 2번/)).toBe(true);
    // 연기 평원(최다 인원 전투)의 '수비수 둘'과 '되찾았고'는 허용 — 위반 목록에 없어야 한다.
    expect(has(/사람 수 표현\([^)]*둘을[^)]*\)[\s\S]*수비수 둘을 뚫고/)).toBe(false);
    expect(has(/\{z\|연기 평원\} 은\(는\) 최근\(7일 안\) 잃은/)).toBe(false);
  });

  it('검수 완료본은 1~7번 위반 0 — 남는 건 회고 상한뿐(2026-09-13 정책 변경)', () => {
    // 회고 허용치를 세 문장 → 한 문장으로 줄였다(사용자 지시: "어제 언급이 너무 잦다").
    // 이 본문은 회고가 두 문장이라 이제 한 건만 걸리고, 나머지 검사는 그대로 통과해야 한다.
    const out = factIssues(CORRECTED, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('회고 문장이 2개');
  });

  it('산수 — 길드 하나만 나온 문장의 N곳이 증감표와 다르면 잡는다', () => {
    const bad = `{g|Winners|17}는 다섯 곳을 얻고 여섯 곳을 내주어 서른 곳을 지켰다.`;
    expect(factIssues(bad, ctx).some((i) => /'6곳'이 사실표와 다르다/.test(i))).toBe(true);
    expect(parseZoneCounts('한 곳을 얻고 열한 곳으로, 서른 곳, 12곳, 한두 곳씩')).toEqual([1, 11, 30, 12]);
  });

  it('열세 방어 구역에서는 인원수 서술을 허용한다(2026-09-10)', () => {
    const withUnderdog = { ...ctx, headcountZones: ['연기 평원', '그을린 고목'] };
    const text = `{g|케케케|27}는 {z|그을린 고목|8}에서 셋으로 일곱을 막아냈다.`;
    expect(factIssues(text, withUnderdog).filter((i) => /사람 수 표현/.test(i))).toEqual([]);
    // 허용 목록에 없으면 그대로 잡힌다.
    expect(factIssues(text, ctx).some((i) => /사람 수 표현/.test(i))).toBe(true);
  });

  it('회고 — 어제 기록이 없는 구역에 어제를 붙이면 잡는다', () => {
    const bad = `{g|Winners|17}는 {z|재의 길목|6}을 쳤다. 그곳은 어제 {g|로제|25}가 얻은 땅이다.`;
    expect(factIssues(bad, ctx).some((i) => /\{z\|재의 길목\} 은\(는\) 어제 기록이 없는 구역/.test(i))).toBe(true);
  });
});

/**
 * 09-24 운영자 교정 회귀(17~23) — 그날 생성본의 실제 오류('합세'·'화산 밖')는 잡고, 사실표에 근거가 있는
 * '나흘째·첫 등장·N개 조각·석권 유지'는 통과해야 한다(그날 사람이 이 넷을 근거 없다며 지웠다가 틀렸다).
 */
describe('factIssues — 09-24 교정 규칙(17~23)', () => {
  const c24: FactCheckContext = {
    zoneRegion: new Map([
      ['설원 신전', '잊힌 신전'], ['검은 첨봉', '드래곤 화산'], ['포자 습지', '슬라임 늪'],
      ['형광 수렁', '슬라임 늪'], ['독성 늪지', '슬라임 늪'],
    ]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [],
    headcountZones: ['설원 신전'],
    recaptureZones: [],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map(),
    heldDays: new Map([['형광 수렁', 4], ['독성 늪지', 3]]),
    otherDays: [2, 7],
    debutGuilds: ['탕후루'],
    topoGuilds: ['로제', '케케케', 'Winners'],
    sweepGuilds: ['Winners'],
  };
  const has = (text: string, re: RegExp) => factIssues(text, c24).some((i) => re.test(i));

  it('17 — 그 지역 구역에 "지역 밖"을 붙이면 잡고, 다른 지역 구역이면 통과', () => {
    expect(has(`화산 밖의 {z|검은 첨봉|1}을 {g|로제|25}가 두드렸다.`, /드래곤 화산 밖/)).toBe(true);
    expect(has(`화산 밖의 {z|포자 습지|23}을 {g|로제|25}가 두드렸다.`, /밖'으로 썼다/)).toBe(false);
    expect(has(`드래곤 화산의 {z|검은 첨봉|1}을 {g|로제|25}가 두드렸다.`, /밖'으로 썼다/)).toBe(false);
  });

  it('18 — 여러 길드를 합세·연합으로 묶으면 잡고, 몰렸다·맞붙었다는 통과', () => {
    expect(has(`{g|민초|28}와 {g|프로미스나인|23}까지 합세한 가운데 {g|로제|25}가 {z|설원 신전|13}을 차지했다.`, /동맹은 없다/)).toBe(true);
    expect(has(`{g|민초|28}와 {g|로제|25}가 {z|설원 신전|13}에 몰려 맞붙었다.`, /동맹은 없다/)).toBe(false);
  });

  it('19 — 사실표 보유 일수와 같으면 통과, 다르면 잡는다', () => {
    expect(has(`{z|형광 수렁|24}은 나흘째 지키던 {g|Winners|17}의 손을 떠났다.`, /보유·지속 일수/)).toBe(false);
    expect(has(`{z|독성 늪지|22}는 닷새 동안 지키던 {g|Winners|17}의 손을 떠났다.`, /보유·지속 일수/)).toBe(true);
    // 구역 무관 일수(석권 7일째)는 통과.
    expect(has(`{g|Winners|17}는 왕국 석권을 7일째 이어 갔다.`, /보유·지속 일수/)).toBe(false);
  });

  it('20 — 첫 등장은 사실표의 첫 등장 길드에만', () => {
    expect(has(`{g|탕후루|43}는 이 한 곳으로 처음 대륙에 이름을 알렸다.`, /첫 등장 길드가 아니다/)).toBe(false);
    expect(has(`{g|레지스탕스|36}는 이 한 곳으로 대륙에 이름을 알렸다.`, /첫 등장 길드가 아니다/)).toBe(true);
  });

  it('21·22 — 조각·석권은 사실표에 나온 길드만', () => {
    expect(has(`{g|케케케|27}는 영토가 한 조각으로 줄었다.`, /지형 형세'에 없다/)).toBe(false);
    expect(has(`{g|탕후루|43}는 영토가 두 조각으로 갈라졌다.`, /지형 형세'에 없다/)).toBe(true);
    expect(has(`{g|Winners|17}는 왕국 석권을 유지했다.`, /석권 현황'에 없다/)).toBe(false);
    expect(has(`{g|로제|25}는 신전을 통째로 쥐었다.`, /석권 현황'에 없다/)).toBe(true);
  });

  it('23 — 빈 구역 묘사는 세 번째부터, 결과 동사는 다섯 번째부터 잡는다', () => {
    const empty3 = `{z|형광 수렁|24}은 지키는 이 없던 땅이다. {z|독성 늪지|22}도 지키는 이 없던 땅이다. {z|설원 신전|13}도 지키는 이 없던 신전이다.`;
    expect(has(empty3, /'지키는 이 없던' 표현이 3번/)).toBe(true);
    const verb4 = `A가 넘어갔다. B가 넘어갔다. C가 넘어갔다. D가 넘어갔다.`;
    expect(has(verb4, /'넘어갔다' 표현/)).toBe(false);
  });
});

/** 09-24 기준선 점검에서 나온 검증기 오탐 3건 — 정상 문장이 재생성을 부르지 않게. */
describe('factIssues — 09-24 오탐 회귀', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['검은 첨봉', '드래곤 화산'], ['포자 습지', '슬라임 늪'], ['설원 신전', '잊힌 신전']]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [{ nickname: '지인', count: 4 }, { nickname: '악마사냥꾼', count: 3 }],
    headcountZones: ['검은 첨봉', '포자 습지'],
    recaptureZones: [],
    yesterdayZones: [],
    // Winners: 얻음 1·잃음 2·현재 22·직전 23 + 지형 형세 조각 수 4.
    guildCounts: new Map([['로제', [6, 0, 15, 9]], ['Winners', [1, 2, 22, 23, 4]]]),
    battleZones: [],
    captureBy: new Map(),
    regionCounts: new Map([['로제', new Map([['잊힌 신전', { gain: 4, loss: 0, after: 4, before: 0 }]])]]),
  };
  it('지역을 앞세운 수는 길드 전체 수와 대조하지 않는다', () => {
    expect(factIssues(`이렇게 {g|로제|25}는 잊힌 신전에서 네 곳을 거둬들였다.`, c).some((i) => /구역 수 '4곳'/.test(i))).toBe(false);
  });
  it('지형 형세의 조각 수는 허용', () => {
    expect(factIssues(`{g|Winners|17}는 스물두 곳을 지녔지만 조각은 네 곳으로 흩어졌다.`, c).some((i) => /구역 수/.test(i))).toBe(false);
  });
  it('한 문장에 인물이 둘이면 처치 수는 바로 앞 인물 것으로 본다', () => {
    const sent = `{z|검은 첨봉|1}에서 {u|지인|go7OSj6U}이 홀로 들어가 넷을 베었고, {z|포자 습지|23}에서는 {u|악마사냥꾼|qhVn7xlU}이 셋을 쓰러뜨렸다.`;
    expect(factIssues(sent, c).some((i) => /쓰러뜨린 수/.test(i))).toBe(false);
    const wrong = `{z|포자 습지|23}에서는 {u|악마사냥꾼|qhVn7xlU}이 넷을 쓰러뜨렸다.`;
    expect(factIssues(wrong, c).some((i) => /악마사냥꾼\} 이\(가\) 쓰러뜨린 수는 3/.test(i))).toBe(true);
  });
});

describe('factIssues — 09-24 최종 시험 오탐 회귀', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['대설봉', '잊힌 신전'], ['대리석 성소', '잊힌 신전'], ['성좌의 폐허', '잊힌 신전'], ['검은 첨봉', '드래곤 화산']]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [],
    headcountZones: [],
    recaptureZones: [],
    yesterdayZones: ['검은 첨봉'],
    guildCounts: new Map([['케케케', [1, 4, 10, 13]]]),
    battleZones: [],
    captureBy: new Map(),
    yesterdayCaptureBy: new Map([['검은 첨봉', 'Winners']]),
  };
  it("'구역을 하나도'는 인원수가 아니다", () => {
    expect(factIssues(`{g|케케케|27}는 구역을 하나도 얻지 못한 채 {z|대설봉|12}을 두드렸다.`, c).some((i) => /사람 수/.test(i))).toBe(false);
  });
  it("나열한 구역을 받는 '두 곳 모두'는 길드 보유 수가 아니다", () => {
    expect(factIssues(`{g|케케케|27}로부터 {z|대리석 성소|14}와 {z|성좌의 폐허|16}를 빼앗았는데 두 곳 모두 수비가 약했다.`, c).some((i) => /구역 수/.test(i))).toBe(false);
  });
  it('소유격 길드는 어제 가져간 쪽으로 보지 않는다', () => {
    expect(factIssues(`{z|검은 첨봉|1}에서는 {g|로제|25}의 공세를 받아냈는데, 그 땅은 어제 손에 넣은 곳이다.`, c).some((i) => /어제 .*차지한 구역이 아니다/.test(i))).toBe(false);
    expect(factIssues(`{z|검은 첨봉|1}은 어제 {g|로제|25}가 차지했던 곳이다.`, c).some((i) => /차지한 구역이 아니다/.test(i))).toBe(true);
  });
});

describe('headlineIssues — 제목 검사(09-24)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['설원 신전', '잊힌 신전'], ['감시 망루', '오크 부락'], ['변경 초소', '오크 부락']]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [{ nickname: 'Eclipse', count: 2 }],
    headcountZones: [],
    recaptureZones: ['설원 신전', '감시 망루'],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map(),
    debutGuilds: ['탕후루'],
    sweepGuilds: ['Winners'],
  };
  it('정상 제목은 통과', () => {
    for (const h of [
      '{g|로제|25}, 하루 만에 되찾은 {z|설원 신전|13}',
      '{u|Eclipse|FXt19nCy}, 홀로 {z|변경 초소|33}를 빼앗다',
      '{g|탕후루|43}의 첫 깃발, {g|세계수|29}의 마지막 깃발',
      '{g|Winners|17}, 왕국 석권을 이어 가다',
    ])
      expect(headlineIssues(h, c)).toEqual([]);
  });
  it('없는 인물·근거 없는 탈환·첫 깃발·석권을 잡는다', () => {
    expect(headlineIssues('{u|악마|x}, 셋을 베다', c).length).toBe(1);
    expect(headlineIssues('{g|로제|25}, {z|변경 초소|33}를 되찾다', c).length).toBe(1);
    expect(headlineIssues('{g|레지스탕스|36}의 첫 깃발', c).length).toBe(1);
    expect(headlineIssues('{g|로제|25}, 신전 석권', c).length).toBe(1);
  });
});

describe('pickRetroFact — 회고로 쓸 연속성 사실 하나(09-24)', () => {
  const lines = [
    '· 구역 「침묵의 회랑」: 길드 「티모집사」 이(가) 어제 얻은 땅을 하루 만에 「로제」 에게 잃음',
    '· 구역 「검은 첨봉」: 길드 「Winners」 이(가) 어제 손에 넣은 땅을 오늘 지켜냄',
    '· 구역 「감시 망루」: 어제 길드 「세계수」 이(가) 「케케케」 에게서 빼앗았던 곳을 오늘 「케케케」 이(가) 되찾음 — 하루 만의 탈환',
    '· 구역 「설원 신전」: 어제 길드 「GunsNRos」 이(가) 「로제」 에게서 빼앗았던 곳을 오늘 「로제」 이(가) 되찾음 — 하루 만의 탈환',
  ];
  it('탈환 우선, 같은 순위면 가장 많은 사람이 몰린 곳', () => {
    expect(pickRetroFact(lines, ['설원 신전'], [])).toBe(3);
    expect(pickRetroFact(lines, [], [])).toBe(2);
    expect(pickRetroFact([], [], [])).toBe(-1);
  });
});

describe('isLightFactIssue — 조기 종료 판정(09-24)', () => {
  it('반복·줄표만 가볍다', () => {
    expect(isLightFactIssue("'지키는 이 없던' 표현이 3번 나온다 — 2번까지만 쓰고")).toBe(true);
    expect(isLightFactIssue('줄표(—)가 2번 나온다 — 줄표 없이')).toBe(true);
    expect(isLightFactIssue("'어제·전날' 회고 문장이 2개다 — 한 문장만")).toBe(false);
    expect(isLightFactIssue('{g|로제} 의 구역 수 \'4곳\'이 사실표와 다르다')).toBe(false);
  });
});

describe('factIssues — 활약 인물의 처치 수는 인원수 규칙에서 빼기(09-24)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['타락한 성소', '타락 천사 부유섬'], ['황금 회랑', '타락 천사 부유섬']]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [{ nickname: '스타', count: 4 }],
    headcountZones: ['타락한 성소'],
    recaptureZones: [],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map(),
  };
  it('앞 문장이 다른 구역이어도 활약 인물의 처치 수는 인원수 위반이 아니다', () => {
    const text = `{g|민초|28}는 {z|황금 회랑|49}을 두드렸다. {u|스타|JJCedyNU}가 이 구역에서 넷을 처치하며 공세를 막아냈다.`;
    expect(factIssues(text, c).some((i) => /사람 수 표현/.test(i))).toBe(false);
  });
});

describe('deRetro — 고르지 않은 연속성 줄에서 회고 낱말 빼기(09-24)', () => {
  it('탈환·상실·방어 문구에서 어제를 뺀다', () => {
    expect(deRetro('· 구역 「설원 신전」: 어제 길드 「GunsNRos」 이(가) 「로제」 에게서 빼앗았던 곳을 오늘 「로제」 이(가) 되찾음 — 하루 만의 탈환')).not.toMatch(/어제/);
    expect(deRetro('· 구역 「침묵의 회랑」: 길드 「티모집사」 이(가) 어제 얻은 땅을 하루 만에 「로제」 에게 잃음')).not.toMatch(/어제/);
    expect(deRetro('· 구역 「검은 첨봉」: 길드 「Winners」 이(가) 어제 손에 넣은 땅을 오늘 지켜냄')).not.toMatch(/어제/);
  });
});

describe('factIssues — 09-25 초안 교정 반영(09-26): 함께·경합 상대·비운 주인·새 이름·기간 과다', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['감시 망루', '오크 부락'], ['대설봉', '잊힌 신전'], ['설원 신전', '잊힌 신전'], ['고사목 숲', '슬라임 늪'], ['타락한 성소', '타락 천사 부유섬'], ['타락의 심연', '타락 천사 부유섬']]),
    regionLabels: ['왕국', '드래곤 화산', '잊힌 신전', '슬라임 늪', '오크 부락', '타락 천사 부유섬'],
    feats: [],
    headcountZones: ['감시 망루'],
    recaptureZones: [],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map(),
    debutGuilds: [],
    attackers: new Map([['대설봉', ['티모집사', '로제']], ['설원 신전', ['민초', 'Winners']], ['감시 망루', ['로제', '세계수']]]),
    unguarded: new Map([['설원 신전', '로제']]),
  };
  const has = (text: string, re: RegExp) => factIssues(text, c).some((i) => re.test(i));

  it("두 길드를 주어로 묶은 '함께 들이닥쳤다·함께 노렸다'는 동맹 표현이다", () => {
    expect(has('오크 부락의 {z|감시 망루|36}에 {g|로제|25} 넷과 {g|세계수|29} 하나가 함께 들이닥쳤다.', /동맹은 없다/)).toBe(true);
    expect(has('{g|로제|25}와 {g|케케케|27}가 함께 노렸지만 막혔다.', /동맹은 없다/)).toBe(true);
  });
  it("구역 둘을 묶은 '함께'는 동맹이 아니다(09-21 게시본)", () => {
    expect(has('{g|민초|28}가 {g|Winners|17}의 {z|타락한 성소|47}와 {z|타락의 심연|48}을 함께 노렸다.', /동맹은 없다/)).toBe(false);
  });
  it('경합 상대는 그 구역을 공격한 길드여야 한다 — 문장에 구역이 여럿이어도 가장 가까운 구역 기준', () => {
    const t = '{g|로제|25}는 {z|고사목 숲|29}을 빼앗고, 잊힌 신전에서도 {g|Winners|17}와 경합해 {z|대설봉|12}을 차지했다.';
    expect(has(t, /경합 상대가 아니다/)).toBe(true);
    expect(has('{g|티모집사|31}와 경합한 끝에 {z|대설봉|12}을 차지했다.', /경합 상대가 아니다/)).toBe(false);
  });
  it("병력을 두지 않은 주인과 '맞붙었다'는 없던 싸움이다", () => {
    expect(has('{g|Winners|17}는 {z|설원 신전|13}을 두고 {g|로제|25}와 다시 맞붙어 그 땅을 빼앗았다.', /병력을 두지 않아/)).toBe(true);
    expect(has('{g|Winners|17}는 {g|민초|28}와 맞붙어 {z|설원 신전|13}을 가져갔다.', /병력을 두지 않아/)).toBe(false);
  });
  it("첫 등장 길드가 없는 날의 '새로운 이름도 등장했다'", () => {
    expect(has('슬라임 늪에서는 새로운 이름도 등장했다.', /새로 등장한 길드가 없다/)).toBe(true);
  });
  it('보유 기간 언급은 두 번까지', () => {
    const three = '{z|대설봉|12}은 이틀 동안, {z|고사목 숲|29}은 아흐레 동안 쥐던 곳이다. 석권은 사흘째 이어졌다.';
    expect(has(three, /보유·지속 기간을 3번/)).toBe(true);
    expect(has('{z|고사목 숲|29}은 아흐레 동안 쥐던 곳이다. 석권은 사흘째 이어졌다.', /보유·지속 기간을/)).toBe(false);
  });
});

describe('factIssues — D판 시험에서 놓친 표현(09-26)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['대설봉', '잊힌 신전'], ['얼음 여울', '잊힌 신전']]),
    regionLabels: ['잊힌 신전'],
    feats: [],
    headcountZones: [],
    recaptureZones: [],
    yesterdayZones: [],
    guildCounts: new Map(),
    battleZones: [],
    captureBy: new Map(),
    attackers: new Map([['대설봉', ['티모집사', '로제']]]),
  };
  it("'{g|A}와 {g|B}의 경합'에서 A가 공격 길드가 아니면 잡는다", () => {
    const iss = factIssues('{g|로제|25}는 {z|대설봉|12}을 {g|Winners|17}와 {g|티모집사|31}의 경합을 뚫고 손에 넣었다.', c);
    expect(iss.some((i) => /\{g\|Winners\} 은\(는\) \{z\|대설봉\}의 경합 상대가 아니다/.test(i))).toBe(true);
    expect(iss.some((i) => /\{g\|티모집사\} 은\(는\)/.test(i))).toBe(false);
  });
  it("'A와 B, C가 함께 노린'도 동맹 표현이다", () => {
    expect(factIssues('{g|레지스탕스|36}와 {g|로제|25}, {g|케케케|27}가 함께 노린 그 땅에서 버텼다.', c).some((i) => /동맹은 없다/.test(i))).toBe(true);
  });
});

describe('오탐 좁힘(09-26 전수조사)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['분노의 분화구', '드래곤 화산']]),
    regionLabels: ['드래곤 화산'],
    feats: [],
    headcountZones: [],
    recaptureZones: [],
    yesterdayZones: [],
    guildCounts: new Map([['로제', [0, 1, 3, 2]], ['케케케', [1, 0, 2, 3]]]),
    battleZones: [],
    captureBy: new Map(),
    debutGuilds: [],
    topoGuilds: [],
  };
  const has = (t: string, kw: string) => factIssues(t, c).some((i) => i.includes(kw));
  it("'새 이름으로'(개명 안내)·'처음으로 땅을 내주며'(첫 상실)는 첫 등장이 아니다", () => {
    expect(has('{g|로제}는 새 이름으로 맞은 첫 점령전에서 {z|분노의 분화구}를 지켰다.', '첫 등장')).toBe(false);
    expect(has('{g|로제}는 처음으로 땅을 내주며 한 곳을 잃었다.', '첫 등장')).toBe(false);
    expect(has('{g|로제}라는 새로운 이름이 대륙에 등장했다.', '첫 등장')).toBe(true);
  });
  it("인물 묘사의 '고립'·길드원 '합류'는 형세·동맹이 아니다", () => {
    expect(has('{g|로제}의 집행관은 고립된 채 끝까지 버텼다.', '형세')).toBe(false);
    expect(factIssues('{g|로제}에 새로 합류한 이들이 {g|케케케}와 맞붙었다.', c).some((i) => i.includes('동맹'))).toBe(false);
    expect(factIssues('{g|케케케}는 {g|로제}에 합류해 분화구를 노렸다.', c).some((i) => i.includes('동맹'))).toBe(true);
    expect(factIssues('{g|로제}와 {g|케케케}가 합류해 공격했다.', c).some((i) => i.includes('동맹'))).toBe(true);
    expect(factIssues('{g|로제} 쪽에 합류한 {g|케케케}가 분화구를 쳤다.', c).some((i) => i.includes('동맹'))).toBe(true);
    expect(factIssues('{g|케케케}가 {g|로제}에 합류한 이후 둘은 분화구를 쳤다.', c).some((i) => i.includes('동맹'))).toBe(true);
  });
  it("영토를 두고 쓴 '고립'은 여전히 형세로 본다", () => {
    expect(has('{g|로제}의 영토는 섬처럼 고립되었다.', '형세')).toBe(true);
    expect(has('{g|로제}는 고립된 두 구역을 지켰다.', '형세')).toBe(true);
    expect(has('{g|로제}는 고립된 {z|분노의 분화구}를 지켰다.', '형세')).toBe(true);
  });
});

describe('기존 오탐 정리(09-26 게시본)', () => {
  const c: FactCheckContext = {
    zoneRegion: new Map([['오크 대요새', '오크 부락'], ['약탈자 야영지', '오크 부락']]),
    regionLabels: ['오크 부락'],
    feats: [],
    headcountZones: [],
    recaptureZones: [],
    yesterdayZones: ['약탈자 야영지'],
    guildCounts: new Map([['로제', [0, 1, 2, 3]], ['케케케', [1, 0, 10, 9]]]),
    battleZones: [],
    captureBy: new Map([['오크 대요새', { winner: '로제', from: '케케케' }]]),
    yesterdayCaptureBy: new Map([['약탈자 야영지', '로제']]),
    regionCounts: new Map([
      ['로제', new Map([['오크 부락', { gain: 0, loss: 1, after: 1, before: 2 }]])],
      ['케케케', new Map([['오크 부락', { gain: 1, loss: 0, after: 5, before: 4 }]])],
    ]),
  };
  const iss = (t: string) => factIssues(t, c);
  it("'어제부터 비워 둔'은 어제 사건 회고·어제 차지 귀속이 아니다", () => {
    const r = iss('{g|케케케}가 어제부터 비워 둔 {z|오크 대요새}를 {g|로제}가 가져갔다.');
    expect(r.some((i) => i.includes('어제 기록이 없는'))).toBe(false);
    expect(r.some((i) => i.includes('차지한 구역이 아니다'))).toBe(false);
  });
  it("회고 속 어제 인원수·'지켜냈던'은 오늘 일로 보지 않는다", () => {
    expect(iss('{z|약탈자 야영지}는 어제 {g|로제}가 셋을 베며 지켜냈던 곳이다.').some((i) => i.includes('사람 수'))).toBe(false);
    expect(iss('{z|오크 대요새}는 어제 {g|로제}가 지켜냈던 땅이다.').some((i) => i.includes('지켜낸 것처럼'))).toBe(false);
    // 오늘 일은 그대로 잡는다
    expect(iss('{g|로제}는 {z|오크 대요새}를 지켜냈다.').some((i) => i.includes('지켜낸 것처럼'))).toBe(true);
  });
  it('관계절 속 길드는 지역별 수의 주어가 아니다', () => {
    expect(iss('{g|케케케}는 {g|로제}가 비워 둔 오크 부락에서 한 곳을 더 얻었다.').some((i) => i.includes('지역 수'))).toBe(false);
    expect(iss('{g|케케케}는 오크 부락에서 세 곳을 더 얻었다.').some((i) => i.includes('지역 수'))).toBe(true);
  });
});
