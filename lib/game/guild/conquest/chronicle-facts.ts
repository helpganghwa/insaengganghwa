/**
 * 연대기 사실 검증기(2026-09-10) — 모델 본문을 코드가 결정론으로 대조해 **재생성 피드백**을 만든다.
 *
 * 왜: 이야기꾼(AI) + 재검수(AI) 두 단계를 거쳐도 매일 같은 종류의 오류가 남아 운영자가 손으로 고쳤다
 * (09-09 지역 오기·없는 방어 창작, 09-10 없는 인물 활약·"어제 내주었던" 창작·지역 오기·인원수 남발·회고 반복).
 * AI에게 "사실표만 따르라"고 아무리 써도 확률적으로 새는 부분이라, 사실표에서 **기계적으로 확정할 수 있는 것**만
 * 골라 코드가 검사하고, 어긋나면 그 문장을 짚어 다시 쓰게 한다(chronicle.ts 재시도 루프·재검수본 채택 판정 공용).
 *
 * 검사(모두 문장 단위, 마커 안 이름은 제외한 평문 기준):
 *  1. 인물 — {u|} 마커는 '개인 활약' 인물만. 그 인물 문장의 'N차례·N번'은 활약 횟수와 같아야 한다.
 *  2. 인원수 — '둘을·셋이·한 명' 같은 사람 수는 인원수가 허용된 전투(최다 인원·열세 방어) 문맥에서만.
 *  3. 지역 — 문장에 지역이 하나만 언급되면 그 문장의 구역은 전부 그 지역이어야 한다. '같은 지역의'는 직전 문맥 지역과 같아야 한다.
 *  4. 재획득 — '되찾다·탈환·도로 가져가다'는 어제 잃은 길드가 오늘 그 구역을 노린 경우에만.
 *  5. 회고 — '어제·전날'이 붙은 구역은 어제 기록(점령·방어)이 있어야 한다.
 *  6. 반복 — '하루 만에'·'어제 … 내주었던'·'다시 노렸다'는 본문 전체에서 한 번까지, 회고 문장은 한 문장까지(09-13 사용자 지시).
 *  7. 산수 — 길드 하나만 나오는 문장의 'N곳'은 그 길드의 얻은 수·잃은 수·현재 보유·직전 보유 중 하나여야 한다.
 *  11~16(2026-09-17 실오류) — 동시 진행에 순서 만들기 · '어제 차지했던'의 귀속 · 지역별 수 · 짧은 복귀 공백의 '오랫동안' ·
 *     쓰러진 인물을 버틴 주어로 · 석권 서수('세 번째로 완성한').
 *  17~23(2026-09-24 운영자 교정) — 'X 지역 밖의 {z|X 지역 구역}' · 서로 다른 길드를 '합세·연합'으로 묶기 ·
 *     사실표와 다른 보유 일수('나흘째') · 첫 등장이 아닌 길드에 '대륙에 이름을 알렸다' · 사실표 지형 형세에 없는
 *     '조각·비지' · 석권 현황에 없는 길드의 '석권' · 같은 표현의 과도한 반복. 17~22는 사실표에 근거가 있으면 통과한다
 *     (09-24에 사람이 '근거 없음'으로 지운 '나흘째·첫 등장·N개 조각·석권 유지'가 실제로는 사실표에 있었다).
 *
 * 순수 함수 — 테스트 tests/guild/chronicle-fact-issues.test.ts(09-10 실제 오류 본문으로 회귀).
 */

export type FactCheckContext = {
  /** 구역 이름 → 지역 라벨(예: '드래곤 화산'). */
  zoneRegion: Map<string, string>;
  /** 지역 라벨 전체(REGION_META label). */
  regionLabels: string[];
  /** 개인 활약 — 등장 가능한 인물과 횟수. */
  feats: { nickname: string; count: number }[];
  /** 인원수 서술이 허용되는 구역 — 가장 많은 사람이 몰린 전투·열세 방어·열세 점령·개인 활약이 나온 구역(09-10, 09-13 확장). */
  headcountZones: string[];
  /** '되찾다'류가 허용되는 구역(어제 잃은 길드가 오늘 그 구역을 노림). */
  recaptureZones: string[];
  /** 어제 기록(점령·방어)이 있는 구역 — 회고 표현 허용 범위. */
  yesterdayZones: string[];
  /** 길드 → 문장에 나올 수 있는 '곳' 수(얻음·잃음·현재·직전). 없으면 검사 생략. */
  guildCounts: Map<string, number[]>;
  /** 그날 전투가 벌어진 구역 전체 — 본문에 하나도 빠지면 안 된다(2026-09-13 왕성·타락의 심연·버섯 군락 누락). */
  battleZones: string[];
  /** 소유권이 바뀐 구역 → 가져간 길드·빼앗긴 길드. 둘 다 그 구역 문단에 나와야 집계 산수가 본문에서 따라진다. */
  captureBy: Map<string, { winner: string; from: string | null }>;
  /** (09-17) 어제 소유권이 바뀐 구역 → 어제 가져간 길드. '어제 {g|G}가 차지했던 곳'의 귀속 검사. 없으면 검사 생략. */
  yesterdayCaptureBy?: Map<string, string>;
  /** (09-17) 길드 → 지역 라벨 → { gain, loss, after, before }. 'X 지역에서 N곳'의 N 검사. 없으면 검사 생략. */
  regionCounts?: Map<string, Map<string, { gain: number; loss: number; after: number; before: number }>>;
  /** (09-17) 영토를 잃은 지 며칠 안 돼 돌아온 길드 — '오랫동안·한동안'을 붙이면 안 된다. */
  shortGapGuilds?: string[];
  /** (09-17) 개인 활약 중 그날 끝내 쓰러진 인물 — '지켜냈다·버텼다'의 주어로 쓰면 안 된다. */
  fellFeats?: string[];
  /** (09-24) 소유권이 바뀐 구역 → 잃은 길드가 쥐고 있던 일수(사실표 '…부터 N일 동안'). 없으면 19번 검사 생략. */
  heldDays?: Map<string, number>;
  /** (09-24) 구역과 무관하게 사실표에 나오는 일수(석권 유지 N일째·복귀 N일 만 등). */
  otherDays?: number[];
  /** (09-24) 첫 등장 길드(사실표 '첫 구역을 확보하며 대륙에 이름을 알림'). 없으면 20번 검사 생략. */
  debutGuilds?: string[];
  /** (09-24) 사실표 '지형 형세'에 나온 길드(조각·비지 서술 근거). 없으면 21번 검사 생략. */
  topoGuilds?: string[];
  /** (09-24) 사실표 '지역 석권 현황'에 나온 길드(유지·붕괴·성립). 없으면 22번 검사 생략. */
  sweepGuilds?: string[];
  /** (09-26) 구역 → 그 구역을 공격한 길드. '{g|G}와 경합'의 상대 검사. 없으면 25번 검사 생략. */
  attackers?: Map<string, string[]>;
  /** (09-26) 주인이 병력을 두지 않아(집행관도 없음) 싸움 없이 넘어간 구역 → 이전 주인. '{g|주인}과 맞붙었다' 검사. */
  unguarded?: Map<string, string>;
};

/** 25·26 — '{g|G}와 경합·맞붙어·맞서'. */
const RIVAL = /\{g\|([^}|]+)(?:\|[^}]*)?\}(?:와|과)(?:의)?\s?(?:다시\s?)?(경합|맞붙|맞서|맞선)/g;
/** 25 보강 — '{g|A}와 {g|B}의 경합'(09-26 D판 시험 — A가 주인이었다). */
const RIVAL_PAIR = /\{g\|([^}|]+)(?:\|[^}]*)?\}(?:와|과)\s?\{g\|([^}|]+)(?:\|[^}]*)?\}의\s?경합/g;
/** 27 — 보유·지속 기간 표현은 하루 글에 이 횟수까지(09-25 운영자 '며칠 차지했다는 언급이 너무 많다'). */
const DURATION_MAX = 2;

const MARKER = /\{([guz])\|([^}|]+)(?:\|[^}]*)?\}/g;

/** 마커를 벗긴 평문(이름 자리는 공백) — 구역 이름 안의 '신전·화산' 같은 낱말이 지역 검사에 섞이지 않게. */
function plainText(s: string): string {
  return s.replace(MARKER, ' ');
}

function tokens(s: string): { kind: 'g' | 'u' | 'z'; name: string }[] {
  const out: { kind: 'g' | 'u' | 'z'; name: string }[] = [];
  for (const m of s.matchAll(MARKER)) out.push({ kind: m[1] as 'g' | 'u' | 'z', name: m[2]!.trim() });
  return out;
}

/** 문장 분리 — 마침표·물음표·느낌표 뒤 공백. 마커 안에는 마침표가 없다. */
function sentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const UNIT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
const TENS: Record<string, number> = { 열: 10, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60, 일흔: 70, 여든: 80, 아흔: 90 };

/** 'N곳' 수사 → 정수(한 곳·열한 곳·서른 곳·12곳). */
export function parseZoneCounts(plain: string): number[] {
  const out: number[] = [];
  for (const m of plain.matchAll(/(스물|서른|마흔|쉰|예순|일흔|여든|아흔|열)?(한|두|세|네|다섯|여섯|일곱|여덟|아홉)?\s?곳/g)) {
    if (!m[1] && !m[2]) continue;
    // '한두 곳'처럼 어림수는 건너뛴다.
    const before = plain.slice(Math.max(0, m.index! - 1), m.index!);
    if (m[2] && !m[1] && /[한두세]/.test(before)) continue;
    // '한 곳도 잃지 않았다'는 0곳이다(09-24 오탐).
    if (m[2] === '한' && !m[1] && /^\s?도/.test(plain.slice(m.index! + m[0].length))) continue;
    out.push((m[1] ? TENS[m[1]]! : 0) + (m[2] ? UNIT[m[2]]! : 0));
  }
  for (const m of plain.matchAll(/(\d+)\s?곳/g)) out.push(Number(m[1]));
  return out;
}

/** 사람 수 표현 — 수사 뒤에 '명·사람'(조사 무관) 또는 조사가 바로 붙는 꼴(둘을·셋이·일곱으로). '두 곳·세 차례·여섯 길드'는 잡지 않는다. */
const HEADCOUNT = /(?<![가-힣])(?:(?:하나|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|둘|셋|넷)\s?(?:명|사람)|(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)(?:이|을|를|의|은|도|만|과|와|으로|로|가)(?![가-힣]))/g;

/**
 * 사람이 아니라 **땅을 세는** 수사 — 인원수 검사에서 제외한다(2026-09-13 오탐 2건).
 *  · "거점 하나를 더 세웠다"  — 앞에 거점·구역·땅이 온다
 *  · "하나를 얻고 하나를 잃어" — 같은 문장이 '곳'으로 세고 있고 사람 이야기가 없다
 * 이걸 안 빼면 정상 문장이 매일 재생성 피드백을 타 연대기가 공회전한다.
 */
const THING_BEFORE = /(구역|거점|땅|자리|깃발|곳|지역)(?:을|를|은|는|이|가|도)?\s?$/;
/** 사람 이야기 표지 — 하나라도 있으면 '곳' 문장이어도 인원수 검사를 그대로 한다. */
const PEOPLE_WORD = /명|사람|수비|공격|병력|베|쓰러|눕|처치|막아|맞서|버[티틴]/;

/** 마커를 같은 길이의 공백으로 바꾼 평문 — 정규식 위치를 마커 위치와 맞대어 '그 표현이 어느 구역 뒤에 나왔는지' 잡는다. */
function plainAligned(s: string): string {
  return s.replace(MARKER, (m) => ' '.repeat(m.length));
}

const RECAPTURE = /되찾|탈환|수복|되돌려|돌려받|도로 가져|다시 가져|다시 손에/;
const RETRO = /어제|전날/;
/** 11 — 구역 사이 순서 표현. */
const SEQUENCE = /곧이어|뒤이어|그 직후|그러자/;
/** 12 — 회고 문장의 '가져간' 동사(잃은 쪽 회고 '어제 내주었던'은 5번 규칙이 본다). */
const RETRO_TAKEN = /차지했|차지한|빼앗았|빼앗은|손에 넣|가져갔|가져간/;
/** 12 — 앞 문장의 여러 구역을 한꺼번에 받는 말. */
const PLURAL_REF = /그 땅들|그곳들|이 땅들|이곳들|그 구역들|모두|모든 곳/;
/** 13 — 'N곳' 수사(위치 포함). */
const ZONE_COUNT = /(?:스물|서른|마흔|쉰|열)?(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉)?\s?곳|\d+\s?곳/g;
/** 14 — 긴 공백 표현. */
const LONG_GAP = /오랫동안|오래도록|오랜만|한동안|긴 공백|오래 영토/;
/** 15 — 버팀·지켜냄 / 쓰러짐. */
const SURVIVED = /지켜냈|지켰|버텨냈|버텼|살아남|끝까지 남/;
const FELL_WORD = /쓰러졌|쓰러지고|쓰러지며|전사했|숨을 거|눈을 감|끝내 무너/;
/** 16 — 석권 서수. */
const SWEEP_ORDINAL = /(?:두|세|네|다섯|여섯)\s?번째(?:로)?\s?(?:완성|장악|석권|지배|손에 넣)/;

/** 18 — 동맹 표현(길드 사이 동맹 제도는 없다 — 같은 구역을 노린 길드들은 서로 경쟁한 것). */
const ALLIANCE = /합세|연합해|연합한|연합을|손잡|손을 잡|힘을 합|동맹|합류/;
/** 18 보강(09-26) — '{g|A} 넷과 {g|B} 하나가 함께 들이닥쳤다'처럼 두 길드를 주어로 묶은 '함께 …'(09-25 초안 두 곳).
 *  구역 둘을 묶은 '{z|X}와 {z|Y}를 함께 노렸다'는 해당 없다(09-21 게시본 오탐). */
const ALLIANCE_TOGETHER = /(?:\{g\|[^}]+\}(?:\s?[가-힣]+)?(?:와|과|,)\s?)+\{g\|[^}]+\}(?:\s?[가-힣]+)?(?:이|가|는|은)\s?함께\s?(?:들이|밀고|밀어붙|노[리렸린]|몰아|몰려|쳐들|공격|두드|덮)/;
/** 19 — 보유·지속 일수(2일 이상). '하루 만에'는 6번 규칙이 본다. */
const DURATION = /(이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|(\d+)\s?일)\s?(?:째|동안|간)/g;
const DAY_WORD: Record<string, number> = { 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 이레: 7, 여드레: 8, 아흐레: 9, 열흘: 10 };
/** 20 — 첫 등장 표현. */
const DEBUT = /대륙에 이름을 알|첫 등장|처음으로 (?:구역|땅|영토|깃발)|첫 (?:영토|깃발|구역을)|새로운 이름|새 이름|새 얼굴/;
/** 21 — 지형 형세 표현. */
const TOPO = /조각|비지|별도의? 거점|떨어진 (?:곳|땅|거점|영토)|고립/;
/** 22 — 지역 석권 표현. */
const SWEEP = /석권|전역을|통째로|전부 쥐|모두 쥐/;
/**
 * 23 — 같은 표현의 과도한 반복(09-24: '지키는 이 없던'이 세 번). 빈 구역 묘사는 세 번째부터, 결과 동사는
 * 다섯 번째부터 잡는다(점령 10건 넘는 날에도 동사가 모자라지 않게 여유를 둔다).
 */
const REPEAT_FAMILIES: { re: RegExp; label: string; max: number; alt: string }[] = [
  { re: /지키는 이 없/g, label: '지키는 이 없던', max: 2, alt: '비어 있던·수비를 두지 않은·주인이 비운' },
  { re: /비어 있/g, label: '비어 있던', max: 2, alt: '지키는 이 없던·수비를 두지 않은' },
  { re: /수비 없/g, label: '수비 없는', max: 2, alt: '비어 있던·지키는 이 없던' },
  { re: /넘어갔|넘어가/g, label: '넘어갔다', max: 4, alt: '손에 들어갔다·차지가 되었다·내주었다' },
  { re: /차지했|차지한|차지가/g, label: '차지했다', max: 4, alt: '가져갔다·손에 넣었다·빼앗았다' },
  { re: /가져갔|가져간/g, label: '가져갔다', max: 4, alt: '차지했다·손에 넣었다·거둬 갔다' },
  { re: /손에 넣|손에 쥐/g, label: '손에 넣었다', max: 3, alt: '차지했다·가져갔다' },
  { re: /판도에서/g, label: '판도에서 …', max: 2, alt: '영토를 모두 잃었다·깃발을 내렸다·자취를 감췄다' },
];

/** 13 — 위치 앞에서 가장 가까운 주어 길드({g|G} 바로 뒤에 은·는·이·가·도). */
function subjectGuildBefore(sent: string, pos: number): string | null {
  let found: string | null = null;
  for (const m of sent.matchAll(/\{g\|([^}|]+)(?:\|[^}]*)?\}(?:은|는|이|가|도)(?![가-힣])/g)) {
    if (m.index! < pos) found = m[1]!.trim();
  }
  return found;
}

/** 지역 별칭 — 라벨의 마지막 낱말('드래곤 화산'→'화산'). 같은 별칭이 둘 이상이면 별칭은 쓰지 않는다. */
function regionAliases(labels: string[]): Map<string, string> {
  const alias = new Map<string, string[]>();
  for (const l of labels) {
    const last = l.split(/\s+/).pop()!;
    alias.set(last, [...(alias.get(last) ?? []), l]);
  }
  const out = new Map<string, string>();
  for (const l of labels) out.set(l, l);
  for (const [a, ls] of alias) if (ls.length === 1 && a !== ls[0]) out.set(a, ls[0]!);
  return out;
}

/** 문장 안의 지역 언급(위치 포함) — 긴 이름(정식 라벨)을 먼저 잡고 그 범위 안의 별칭은 세지 않는다. */
function regionMentions(aligned: string, aliases: Map<string, string>): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  const covered: [number, number][] = [];
  for (const [key, label] of [...aliases.entries()].sort((a, b) => b[0].length - a[0].length)) {
    let i = aligned.indexOf(key);
    while (i >= 0) {
      if (!covered.some(([a, b]) => i >= a && i < b)) {
        out.push({ at: i, label });
        covered.push([i, i + key.length]);
      }
      i = aligned.indexOf(key, i + key.length);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function factIssues(text: string, ctx: FactCheckContext): string[] {
  const issues: string[] = [];
  const featByNick = new Map(ctx.feats.map((f) => [f.nickname, f.count] as const));
  const headcount = new Set(ctx.headcountZones);
  const recapture = new Set(ctx.recaptureZones);
  const yesterday = new Set(ctx.yesterdayZones);
  const aliases = regionAliases(ctx.regionLabels);

  let retroSentences = 0;
  for (const para of text.split(/\n\n+/)) {
    let lastZone: string | null = null;
    let prevZones: string[] = [];
    let lastRegion: string | null = null;
    for (const sent of sentences(para)) {
      const toks = tokens(sent);
      const plain = plainText(sent);
      const aligned = plainAligned(sent);
      const zones = toks.filter((t) => t.kind === 'z').map((t) => t.name);
      const guilds = [...new Set(toks.filter((t) => t.kind === 'g').map((t) => t.name))];
      // 위치 기반 구역 문맥 — 표현 앞에 나온 마지막 구역 마커, 없으면 앞 문장에서 이어진 구역. 한 문장이
      // "…넷이 둘을 뚫고 도로 가져갔고, {g|B}는 대신 {z|Y}를 쳐서…"처럼 두 구역을 잇는 경우를 가른다.
      const zonePos: { at: number; name: string }[] = [];
      for (const m of sent.matchAll(MARKER)) if (m[1] === 'z') zonePos.push({ at: m.index!, name: m[2]!.trim() });
      const zoneAt = (pos: number): string | null => {
        let z: string | null = lastZone;
        for (const zp of zonePos) if (zp.at < pos) z = zp.name;
        return z;
      };
      const q = (s: string) => `「${s.length > 60 ? s.slice(0, 60) + '…' : s}」`;

      // 1. 인물
      for (const t of toks.filter((t) => t.kind === 'u')) {
        const count = featByNick.get(t.name);
        if (count === undefined) {
          issues.push(`정리의 개인 활약에 없는 인물 {u|${t.name}} 이(가) 등장했다 — 그 문장을 통째로 지우고, 활약은 개인 활약 목록의 인물만 쓴다: ${q(sent)}`);
          continue;
        }
        const m = plain.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?(차례|번)/);
        if (m && UNIT[m[1]!] !== undefined && UNIT[m[1]!] !== count && !(m[1] === '열' && count === 10)) {
          issues.push(`{u|${t.name}} 의 활약 횟수는 ${count}인데 문장은 '${m[0]}'로 적었다: ${q(sent)}`);
        }
        // 2026-09-14 — 인원수 허용 구역을 '활약이 나온 구역'까지 넓히면서, 활약 인물 문장의
        // "둘을 베고·셋을 쓰러뜨리고"가 실제 처치 수와 대조되지 않는 구멍이 생겼다. 그 사람이 쓰러뜨린
        // 수(단독 서수+조사 꼴)도 활약 횟수와 같아야 한다. '여섯을 모아'처럼 상대가 모은 수는 활약이
        // 아니므로 '베|쓰러|눕|처치|잡|무너' 동사가 바로 뒤따르는 경우만 본다.
        const HEAD_UNIT: Record<string, number> = { 하나: 1, 둘: 2, 셋: 3, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
        // 한 문장에 인물이 둘 이상이면 처치 표현은 바로 앞의 인물 것이다(09-24 오탐: 지인의 '넷을 베며'를 뒤의 악마사냥꾼에 대조).
        const uMarks = [...sent.matchAll(MARKER)].filter((m) => m[1] === 'u').map((m) => ({ at: m.index!, name: m[2]!.trim() }));
        for (const k of plainAligned(sent).matchAll(/(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)(?:을|를)\s?(?:모두\s?|전부\s?|다\s?)?(베|쓰러|눕|처치|잡|무너)/g)) {
          const owner = [...uMarks].reverse().find((u) => u.at < k.index!);
          if (owner && owner.name !== t.name) continue;
          const n = HEAD_UNIT[k[1]!]!;
          if (n !== count) {
            issues.push(`{u|${t.name}} 이(가) 쓰러뜨린 수는 ${count}인데 문장은 '${k[1]}${k[0].slice(k[1]!.length, k[1]!.length + 1)} ${k[2]}…'로 적었다 — 개인 활약 목록의 수로 고친다: ${q(sent)}`);
          }
        }
      }

      // 2. 인원수
      // '곳'으로 구역을 세는 문장에 사람 이야기가 없으면 그 안의 수사는 전부 땅이다(집계 문단).
      const countsZones = /곳/.test(plain) && !PEOPLE_WORD.test(plain);
      // 개인 활약 인물이 주어인 처치 표현('{u|스타}가 넷을 처치')은 1번 규칙이 활약 수와 대조한다 — 여기서 구역 문맥으로 또 보면
      // '이 구역에서'처럼 구역 마커 없이 쓴 문장이 앞 문장의 다른 구역에 묶여 오탐(09-24).
      const featInSent = toks.some((t) => t.kind === 'u' && featByNick.has(t.name));
      const heads = [...aligned.matchAll(HEADCOUNT)]
        .filter((m) => {
          if (countsZones) return false;
          if (featInSent && /^\s?(?:모두\s?|전부\s?|다\s?)?(?:베|쓰러|눕|처치|잡|무너)/.test(aligned.slice(m.index! + m[0].length))) return false;
          if (THING_BEFORE.test(aligned.slice(Math.max(0, m.index! - 6), m.index!))) return false;
          const z = zoneAt(m.index!);
          return !(z && headcount.has(z));
        })
        .map((m) => m[0].trim());
      if (heads.length > 0) {
        issues.push(
          `사람 수 표현(${heads.join(', ')})은 인원수가 허용된 전투${ctx.headcountZones.length ? `(${ctx.headcountZones.join(', ')})` : '(이번엔 없음)'} 문맥에서만 쓴다 — 이 문장에서는 인원수를 빼고 '수비를 세워·수비를 뚫고'처럼 쓴다: ${q(sent)}`,
        );
      }

      // 3. 지역 — 구역 마커 앞에 나온 마지막 지역 언급이 그 구역을 지배한다("잊힌 신전에서는 … {z|X}", "오크 부락의 {z|Y}").
      //    '같은 지역의 {z|Z}'는 앞선 지역 언급(없으면 앞 문장에서 이어진 지역)과 같아야 한다.
      const mentions = regionMentions(aligned, aliases);
      const regions = [...new Set(mentions.map((m) => m.label))];
      const sameMatches = [...aligned.matchAll(/같은 (지역|화산|늪|부락|신전|섬|왕국)/g)].map((m) => ({ at: m.index!, word: m[1]! }));
      for (const zp of zonePos) {
        const r = ctx.zoneRegion.get(zp.name);
        if (!r) continue;
        let governing: string | null = null;
        for (const m of mentions) if (m.at < zp.at) governing = m.label;
        // '같은 섬·같은 늪'처럼 지역 낱말이 붙으면 그 낱말이 가리키는 지역이 기준이다 — 앞 문맥의 다른 지역(왕국)으로
        // 이으면 오탐(09-24 '왕국의 {z|기사 연무장}… 같은 섬의 {z|타락한 성소}').
        const sameHit = [...sameMatches].reverse().find((sm) => sm.at < zp.at && !mentions.some((m) => m.at > sm.at && m.at < zp.at));
        const viaSame = !!sameHit;
        if (sameHit && sameHit.word !== '지역') {
          const byWord = ctx.regionLabels.find((l) => (l.split(/\s+/).pop() ?? '').endsWith(sameHit.word));
          if (byWord) governing = byWord;
        } else if (viaSame && !governing) governing = lastRegion;
        if (governing && governing !== r) {
          issues.push(`{z|${zp.name}} 은(는) ${r} 지역인데 문장은 ${governing} 지역으로 묶었다 — 지역 표기를 정리대로 고친다: ${q(sent)}`);
        }
      }

      // 4. 재획득
      for (const m of aligned.matchAll(new RegExp(RECAPTURE.source, 'g'))) {
        const z = zoneAt(m.index!);
        if (z && !recapture.has(z)) {
          issues.push(`{z|${z}} 은(는) 어제 잃은 길드가 오늘 노린 구역이 아니라 '되찾다·탈환·도로 가져가다'를 쓸 수 없다 — '빼앗다·차지하다·넘겨받다'로 고친다: ${q(sent)}`);
        }
      }

      // 5. 회고 — 문장에 구역 마커가 있으면 그중 하나라도 어제 기록이 있으면 통과("전날 잃은 {z|X}"처럼 구역이 뒤에 오는 꼴),
      //    없으면 앞 문장에서 이어진 구역으로 판정("그곳은 어제 …").
      if (RETRO.test(plain)) {
        retroSentences += 1;
        if (zones.length > 0) {
          if (!zones.some((z) => yesterday.has(z))) {
            issues.push(`{z|${zones[0]}} 은(는) 어제 기록이 없는 구역이라 '어제·전날' 회고를 붙일 수 없다 — 회고 없이 오늘 일만 쓴다: ${q(sent)}`);
          }
        } else if (lastZone && !yesterday.has(lastZone)) {
          issues.push(`{z|${lastZone}} 은(는) 어제 기록이 없는 구역이라 '어제·전날' 회고를 붙일 수 없다 — 회고 없이 오늘 일만 쓴다: ${q(sent)}`);
        }
      }

      // 7. 산수
      if (guilds.length === 1) {
        const allowed = ctx.guildCounts.get(guilds[0]!);
        if (allowed) {
          // 지역을 앞세운 수('잊힌 신전에서 네 곳')는 13번(지역별 수)이 본다 — 여기서 길드 전체 수와 대조하면 오탐(09-24).
          const regionScoped = new Set<number>();
          if (ctx.regionCounts) {
            for (const m of aligned.matchAll(ZONE_COUNT)) {
              const near = mentions.some((r) => r.at < m.index! && m.index! - r.at <= 30 && !aligned.slice(r.at, m.index!).includes(','));
              const n = parseZoneCounts(m[0])[0];
              if (near && n !== undefined) regionScoped.add(n);
            }
          }
          // '{z|A}와 {z|B}를 … 두 곳 모두'처럼 문장에 나열한 구역을 받는 수는 길드 보유 수가 아니다(09-24 오탐).
          const enumerated = /곳\s?(?:모두|다|전부|다같이)/.test(plain) ? zones.length : -1;
          for (const n of parseZoneCounts(plain).filter((x) => !regionScoped.has(x) && x !== enumerated)) {
            if (!allowed.includes(n)) {
              issues.push(`{g|${guilds[0]}} 의 구역 수 '${n}곳'이 사실표와 다르다(가능한 수: ${[...new Set(allowed)].join('·')}) — '길드별 보유 증감'대로 고친다: ${q(sent)}`);
            }
          }
        }
      }

      // 11. 동시 진행 — 모든 구역의 점령전은 같은 시각이다. 구역 사이에 순서를 만들면 사실이 아니다(09-17 "곧이어 {g|민초}까지").
      const seq = plain.match(SEQUENCE);
      if (seq) {
        issues.push(`점령전은 모든 구역에서 같은 시각에 벌어지는데 '${seq[0]}'로 순서를 만들었다 — '같은 날·한편'으로 고친다: ${q(sent)}`);
      }

      // 12. '어제 … 차지했던'의 귀속 — 가리키는 구역이 전부 어제 그 길드가 가져간 곳이어야 한다.
      //     구역 마커가 없고 '그 땅들·그곳들·모두'로 받으면 앞 문장의 구역 전부를 가리킨다(09-17: 넷 중 둘만 어제 차지).
      if (ctx.yesterdayCaptureBy && RETRO.test(plain) && RETRO_TAKEN.test(plain)) {
        const targets = zones.length > 0 ? zones : PLURAL_REF.test(plain) ? prevZones : lastZone ? [lastZone] : [];
        // 주어 길드({g|G}은·는·이·가·도)만 본다 — '{g|로제}의 공세를 받아냈는데, 그 땅은 어제 손에 넣은'처럼 소유격 길드는
        // 어제 가져간 쪽이 아니다(09-24 오탐). 주어가 없으면 그 구역이 어제 누군가에게 넘어간 곳이기만 하면 된다.
        const subjects = [...sent.matchAll(/\{g\|([^}|]+)(?:\|[^}]*)?\}(?:은|는|이|가|도)(?![가-힣])/g)].map((m) => m[1]!.trim());
        const wrong = targets.filter((z) => {
          const by = ctx.yesterdayCaptureBy!.get(z);
          if (!by) return true;
          return subjects.length > 0 && !subjects.includes(by);
        });
        if (wrong.length > 0) {
          issues.push(
            `${wrong.map((z) => `{z|${z}}`).join(', ')} 은(는) 어제 ${guilds.length > 0 ? guilds.map((g) => `{g|${g}}`).join('·') + ' 이(가) ' : ''}차지한 구역이 아니다 — 점령 줄의 보유 기간 표기대로 어제 차지한 구역만 묶어 쓴다: ${q(sent)}`,
          );
        }
      }

      // 13. 지역별 수 — 'X 지역에서 N곳을 늘렸다'의 N은 그 길드의 그 지역 수여야 한다(09-17: 오크 부락 2곳을 '세 곳'으로).
      if (ctx.regionCounts) {
        for (const m of aligned.matchAll(ZONE_COUNT)) {
          const at = m.index!;
          const n = parseZoneCounts(m[0])[0];
          if (n === undefined) continue;
          const reg = [...mentions].reverse().find((r) => r.at < at && at - r.at <= 30 && !aligned.slice(r.at, at).includes(','));
          if (!reg) continue;
          const subject = subjectGuildBefore(sent, at);
          if (!subject || !ctx.guildCounts.has(subject)) continue;
          const c = ctx.regionCounts.get(subject)?.get(reg.label) ?? { gain: 0, loss: 0, after: 0, before: 0 };
          const verb = aligned.slice(at + m[0].length, at + m[0].length + 10);
          const allowed = /늘|더|얻|차지|가져|넓|손에/.test(verb)
            ? [c.gain]
            : /잃|내주|내준|빼앗기/.test(verb)
              ? [c.loss]
              : [c.gain, c.loss, c.after, c.before];
          if (!allowed.includes(n)) {
            issues.push(
              `{g|${subject}} 의 ${reg.label} 지역 수 '${n}곳'이 사실표와 다르다(그 지역 얻음 ${c.gain}·잃음 ${c.loss}·보유 ${c.after}) — 점령 줄의 '지역별' 수대로 고친다: ${q(sent)}`,
            );
          }
        }
      }

      // 14. 짧은 복귀 공백 — 하루이틀 비었다 돌아온 길드에 '오랫동안'을 붙이지 않는다(09-17 민초).
      if (ctx.shortGapGuilds && LONG_GAP.test(plain)) {
        const g = guilds.find((x) => ctx.shortGapGuilds!.includes(x));
        if (g) issues.push(`{g|${g}} 은(는) 영토를 잃은 지 며칠 만에 돌아왔는데 긴 공백처럼 썼다 — '오랫동안·한동안'을 빼고 사실표의 복귀 일수대로 쓴다: ${q(sent)}`);
      }

      // 15. 쓰러진 인물 — 끝내 쓰러진 사람을 '지켜냈다·버텼다'의 주어로 쓰지 않는다(09-17 늪지 오두막 전사).
      if (ctx.fellFeats) {
        for (const tk of toks.filter((x) => x.kind === 'u' && ctx.fellFeats!.includes(x.name))) {
          if (SURVIVED.test(plain) && !FELL_WORD.test(plain)) {
            issues.push(`{u|${tk.name}} 은(는) 그날 끝내 쓰러졌는데 버티고 지켜낸 것처럼 썼다 — 쓰러뜨린 뒤 쓰러졌다고 쓰고, 지켜낸 주어는 길드로 나눈다: ${q(sent)}`);
          }
        }
      }

      // 16. 석권 서수 — '세 번째로 완성한 지역' 같은 순번은 사실표가 주지 않는다(09-17).
      const ord = plain.match(SWEEP_ORDINAL);
      if (ord) issues.push(`지역 석권에 '${ord[0]}' 같은 순번을 붙였다 — 사실표 '지역 석권 현황'의 이력만 쓰고 서수는 뺀다: ${q(sent)}`);

      // 17. 'X 지역 밖의 {z|X 지역 구역}' — 부정어 '밖'을 지역 검사(3번)가 못 봐 통과했다(09-24 '화산 밖의 검은 첨봉').
      for (const m of mentions) {
        // 정식 이름('드래곤 화산') 또는 별칭('화산') 바로 뒤에 '밖·바깥'이 오는 경우만.
        const last = m.label.split(/\s+/).pop()!;
        const head = aligned.slice(m.at, m.at + m.label.length + 4);
        if (!(head.startsWith(m.label) ? /^\s?(?:밖|바깥)/.test(head.slice(m.label.length)) : head.startsWith(last) && /^\s?(?:밖|바깥)/.test(head.slice(last.length)))) continue;
        for (const zp of zonePos) {
          if (zp.at > m.at && ctx.zoneRegion.get(zp.name) === m.label) {
            issues.push(`{z|${zp.name}} 은(는) ${m.label} 지역인데 '${m.label} 밖'으로 썼다 — 지역 표기를 정리대로 고친다: ${q(sent)}`);
          }
        }
      }

      // 18. 동맹 표현 — 같은 구역을 노린 길드들은 서로 경쟁했다(09-24 '민초와 프로미스나인까지 합세한').
      const ally = plain.match(ALLIANCE) ?? sent.match(ALLIANCE_TOGETHER)?.[0].match(/함께\s?\S+/);
      if (ally && guilds.length >= 2) {
        issues.push(`길드 사이에 동맹은 없다 — '${ally[0]}'로 여러 길드를 한편처럼 묶었다. 같은 구역을 함께 노린 길드들은 서로 경쟁했으니 '몰렸다·맞붙었다·경합했다'로 고친다: ${q(sent)}`);
      }

      // 19. 보유 일수 — 사실표의 '…부터 N일 동안 쥐고 있던 곳'·'석권 N일째'·'N일 만의 복귀'와 같아야 한다.
      if (ctx.heldDays) {
        for (const m of aligned.matchAll(DURATION)) {
          const n = m[2] ? Number(m[2]) : DAY_WORD[m[1]!]!;
          const near = [...new Set([...zones, ...(lastZone ? [lastZone] : [])])];
          const allowed = new Set<number>([...near.map((z) => ctx.heldDays!.get(z)).filter((d): d is number => d != null), ...(ctx.otherDays ?? [])]);
          if (!allowed.has(n)) {
            issues.push(`'${m[0].trim()}'는 사실표의 보유·지속 일수와 다르다${allowed.size ? `(사실표: ${[...allowed].sort((a, b) => a - b).join('·')}일)` : '(이 구역엔 일수 정보 없음)'} — 사실표에 적힌 일수만 쓰거나 기간 표현을 뺀다: ${q(sent)}`);
          }
        }
      }

      // 25·26. 경합 상대 — 경합은 같은 구역을 노린 공격 길드끼리의 일이다(09-25 초안 'Winners와 경합해 대설봉을
      //  Winners에게서' — 실제 상대는 티모집사). 병력 없이 비운 주인과 '맞붙었다'도 없던 싸움이다(설원 신전).
      if (ctx.attackers) {
        // 대상 구역 = 그 표현에 가장 가까운 구역 마커(앞뒤 글자 거리). 문장에 구역이 없으면 앞 문장의 구역.
        const zpos = [...sent.matchAll(/\{z\|([^}|]+)(?:\|[^}]*)?\}/g)].map((m) => ({ name: m[1]!.trim(), s: m.index!, e: m.index! + m[0].length }));
        // 표현 하나당 {길드, 동사, 위치}. 'A와 B의 경합'은 A·B 둘 다 경합 상대로 본다.
        const hits = [
          ...[...sent.matchAll(RIVAL)].map((m) => ({ g: m[1]!.trim(), verb: m[2]!, s: m.index!, e: m.index! + m[0].length })),
          ...[...sent.matchAll(RIVAL_PAIR)].flatMap((m) => [m[1]!, m[2]!].map((g) => ({ g: g.trim(), verb: '경합', s: m.index!, e: m.index! + m[0].length }))),
        ];
        for (const h of hits) {
          const ms = h.s;
          const me = h.e;
          const near = zpos.length
            ? zpos.reduce((a, b) => (Math.min(Math.abs(ms - b.e), Math.abs(b.s - me)) < Math.min(Math.abs(ms - a.e), Math.abs(a.s - me)) ? b : a)).name
            : lastZone;
          const z = near;
          const atk = z ? ctx.attackers.get(z) : undefined;
          if (z && atk) {
            const g = h.g;
            if (h.verb === '경합' && !atk.includes(g)) {
              issues.push(`{g|${g}} 은(는) {z|${z}}의 경합 상대가 아니다(그 구역을 공격한 길드: ${atk.map((a) => `{g|${a}}`).join('·')}) — 경합은 공격한 길드끼리 쓰고, 주인은 '지키던·빼앗긴' 쪽으로 쓴다: ${q(sent)}`);
            } else if (h.verb !== '경합' && ctx.unguarded?.get(z) === g && !atk.includes(g)) {
              issues.push(`{g|${g}} 은(는) {z|${z}}에 병력을 두지 않아 싸움이 없었다 — '맞붙었다·맞섰다' 대신 '비워 둔·지키는 이 없던'으로 쓴다: ${q(sent)}`);
            }
          }
        }
      }

      // 20. 첫 등장 — 사실표가 첫 등장으로 적은 길드에만.
      //  길드 없이 '새로운 이름도 등장했다'만 쓴 문장은 그날 첫 등장 길드가 없을 때 잡는다(09-25 초안 — 실제는 복귀).
      if (ctx.debutGuilds && DEBUT.test(plain) && (guilds.length > 0 ? !guilds.some((g) => ctx.debutGuilds!.includes(g)) : ctx.debutGuilds.length === 0)) {
        issues.push(guilds.length ? `${guilds.map((g) => `{g|${g}}`).join('·')} 은(는) 사실표의 첫 등장 길드가 아니다 — '대륙에 이름을 알렸다·첫 등장'은 빼고, 복귀면 '돌아왔다'로 쓴다: ${q(sent)}` : `그날 새로 등장한 길드가 없다 — '새로운 이름·첫 등장'은 빼고, 복귀한 길드면 '돌아왔다'로 쓴다: ${q(sent)}`);
      }

      // 21. 지형 형세 — '조각·비지·별도 거점'은 사실표 지형 형세에 나온 길드만.
      if (ctx.topoGuilds && TOPO.test(plain) && guilds.length > 0 && !guilds.some((g) => ctx.topoGuilds!.includes(g))) {
        issues.push(`${guilds.map((g) => `{g|${g}}`).join('·')} 의 영토 모양(조각·비지)은 사실표 '지형 형세'에 없다 — 그 서술을 뺀다: ${q(sent)}`);
      }

      // 22. 석권 — 사실표 '지역 석권 현황'에 나온 길드만.
      if (ctx.sweepGuilds && SWEEP.test(plain) && guilds.length > 0 && !guilds.some((g) => ctx.sweepGuilds!.includes(g))) {
        issues.push(`${guilds.map((g) => `{g|${g}}`).join('·')} 은(는) 사실표 '지역 석권 현황'에 없다 — 석권·전역 표현을 뺀다: ${q(sent)}`);
      }

      if (zones.length > 0) {
        lastZone = zones[zones.length - 1]!;
        prevZones = zones;
      }
      if (regions.length === 1) lastRegion = regions[0]!;
      else if (regions.length === 0 && zones.length > 0) lastRegion = ctx.zoneRegion.get(zones[zones.length - 1]!) ?? lastRegion;
      else if (regions.length > 1) lastRegion = null;
    }
  }

  // 6. 반복
  const whole = plainText(text);
  const once = (re: RegExp, label: string) => {
    const n = (whole.match(re) ?? []).length;
    if (n > 1) issues.push(`'${label}' 표현이 ${n}번 나온다 — 한 번만 쓰고 나머지는 '갓 얻은 땅·잃은 지 하루 된·곧바로 다시 주인이 바뀐'처럼 바꿔 쓴다.`);
  };
  once(/하루 만에/g, '하루 만에');
  once(/어제[^.]*내주었던/g, '어제 … 내주었던');
  once(/다시 노렸다/g, '다시 노렸다');
  // 24. 줄표 — SYSTEM이 금지하는데 검사가 없어 새어 나왔다(09-24 점검). 유저 글에 줄표를 쓰지 않는 운영 방침과 같다.
  if (/—/.test(text)) issues.push(`줄표(—)가 ${(text.match(/—/g) ?? []).length}번 나온다 — 줄표 없이 새 문장이나 쉼표로 잇는다.`);
  // 23. 같은 표현의 과도한 반복.
  // 27. 보유 기간 과다 — 사실이 맞아도 '며칠 동안 쥐고 있던'이 이어지면 글이 날짜 나열이 된다(09-25 운영자 교정).
  const durations = [...plainText(text).matchAll(DURATION)].length;
  if (durations > DURATION_MAX)
    issues.push(`보유·지속 기간을 ${durations}번 언급했다 — 그날 의미가 큰 ${DURATION_MAX}곳(오래 쥔 땅을 잃음·석권·복귀 등)만 남기고 나머지 문장에서는 기간을 뺀다.`);
  for (const f of REPEAT_FAMILIES) {
    const n = (whole.match(f.re) ?? []).length;
    if (n > f.max) issues.push(`'${f.label}' 표현이 ${n}번 나온다 — ${f.max}번까지만 쓰고 나머지는 '${f.alt}'처럼 바꿔 쓰거나, 같은 말을 되풀이하는 문장을 합친다.`);
  }
  // 회고는 한 문장까지(2026-09-13 사용자 지시 — 종전 세 문장은 '어제 언급이 너무 잦다'는 평의 원인).
  if (retroSentences > 1)
    issues.push(
      `'어제·전날' 회고 문장이 ${retroSentences}개다 — **한 문장**만 남기고 나머지 연속성은 회고 표현 없이 오늘 일로만 쓴다.`,
    );

  // 8. 구역 누락 — 그날 전투가 있었던 구역은 전부 본문에 나와야 한다. 빠지면 그 전투가
  //    통째로 없던 일이 된다(2026-09-13: 19전투 중 3곳이 빠져 Winners 방어전 일부가 사라졌다).
  const mentionedZones = new Set(tokens(text).filter((t) => t.kind === 'z').map((t) => t.name));
  const missing = ctx.battleZones.filter((z) => !mentionedZones.has(z));
  if (missing.length > 0) {
    issues.push(
      `그날 전투가 있었는데 본문에 한 번도 안 나온 구역이 ${missing.length}곳이다: ${missing
        .map((z) => `{z|${z}}`)
        .join(', ')} — 정리대로 각 구역의 결과를 한 번씩은 쓴다(지어내기 금지).`,
    );
  }

  // 9·10. 점령 구역 — 가져간 길드를 '지켰다'로 쓰거나(주체 혼동), 승자·이전 주인 중 하나라도
  //       그 구역 문단에 없으면(귀속 누락) 잡는다. 둘 다 2026-09-13 실오류.
  const HELD = /지켰|지켜냈|막아냈|사수|버텨냈|내주지 않/;
  for (const para of text.split(/\n\n+/)) {
    const paraGuilds = new Set(tokens(para).filter((t) => t.kind === 'g').map((t) => t.name));
    for (const sent of sentences(para)) {
      const toks = tokens(sent);
      const gs = new Set(toks.filter((t) => t.kind === 'g').map((t) => t.name));
      // '지켰다'는 그 구역을 다루는 구간(앞 구역 마커 뒤 ~ 다음 구역 마커 앞)에서만 본다 — 한 문장이 빼앗은 구역과
      // 지켜낸 구역을 함께 말할 때 뒤 구역의 '막아냈다'가 앞 구역에 걸리던 오탐(09-17 불탄 마을·잿더미 폐허).
      const aligned = plainAligned(sent);
      const zmarks = [...sent.matchAll(MARKER)].filter((m) => m[1] === 'z').map((m) => ({ at: m.index!, end: m.index! + m[0].length, name: m[2]!.trim() }));
      for (let k = 0; k < zmarks.length; k++) {
        const z = zmarks[k]!.name;
        const c = ctx.captureBy.get(z);
        if (!c) continue;
        const segment = aligned.slice(k > 0 ? zmarks[k - 1]!.end : 0, k + 1 < zmarks.length ? zmarks[k + 1]!.at : aligned.length);
        if (gs.has(c.winner) && HELD.test(segment)) {
          issues.push(
            `{z|${z}} 은(는) {g|${c.winner}} 이(가) ${c.from ? `{g|${c.from}} 에게서 ` : ''}**빼앗은** 구역인데 지켜낸 것처럼 썼다 — '차지했다·가져갔다·손에 넣었다'로 고친다: ${
              sent.length > 60 ? sent.slice(0, 60) + '…' : sent
            }`,
          );
        }
      }
    }
    // 귀속 — 이 문단이 그 구역을 처음 다룬다면 승자와 이전 주인이 같은 문단 안에 있어야 한다.
    for (const z of new Set(tokens(para).filter((t) => t.kind === 'z').map((t) => t.name))) {
      const c = ctx.captureBy.get(z);
      if (!c) continue;
      const firstPara = text.split(/\n\n+/).find((pp) => pp.includes(`{z|${z}`)) === para;
      if (!firstPara) continue;
      const lack: string[] = [];
      if (!paraGuilds.has(c.winner)) lack.push(`가져간 길드 {g|${c.winner}}`);
      if (c.from && !paraGuilds.has(c.from)) lack.push(`빼앗긴 길드 {g|${c.from}}`);
      if (lack.length > 0) {
        issues.push(
          `{z|${z}} 의 소유권 이동에서 ${lack.join('와(과) ')} 이(가) 같은 문단에 없다 — 누가 누구에게서 가져갔는지 밝혀야 마지막 집계의 증감이 본문에서 따라진다.`,
        );
      }
    }
  }

  return [...new Set(issues)];
}

/**
 * 제목 검사(2026-09-24) — 본문 검사(factIssues)는 문단·구역 누락·귀속처럼 본문 전체를 전제로 한 규칙이 많아
 * 한 줄 제목에 그대로 쓰면 오탐이 난다. 제목에서도 틀리면 안 되는 것만 본다: 없는 인물, 근거 없는 '되찾다',
 * 석권 서수, 첫 등장 아닌 길드의 첫 깃발, 동맹 표현, 석권 현황에 없는 길드의 석권.
 */
export function headlineIssues(headline: string, ctx: FactCheckContext): string[] {
  const h = headline.trim();
  if (!h) return [];
  const issues: string[] = [];
  const toks = tokens(h);
  const plain = plainText(h);
  const guilds = [...new Set(toks.filter((t) => t.kind === 'g').map((t) => t.name))];
  const zones = toks.filter((t) => t.kind === 'z').map((t) => t.name);
  const feats = new Set(ctx.feats.map((f) => f.nickname));
  for (const t of toks.filter((x) => x.kind === 'u')) {
    if (!feats.has(t.name)) issues.push(`제목의 {u|${t.name}} 은(는) 개인 활약 목록에 없는 인물이다: 「${h}」`);
  }
  if (RECAPTURE.test(plain)) {
    const recapture = new Set(ctx.recaptureZones);
    // 구역이 없으면 지역 단위 탈환('되찾은 슬라임 늪')이라 판정할 구역이 없다 — 허용 구역이 하나도 없는 날만 잡는다.
    if (zones.length > 0 ? zones.some((z) => !recapture.has(z)) : recapture.size === 0) {
      issues.push(`제목의 '되찾다·탈환'은 어제 잃은 구역을 오늘 되찾은 경우에만 쓴다: 「${h}」`);
    }
  }
  if (SWEEP_ORDINAL.test(plain)) issues.push(`제목에 석권 순번('세 번째로' 등)을 붙였다: 「${h}」`);
  // '{g|G}의 첫 깃발' 꼴은 바로 아래 규칙이 그 길드를 정확히 본다(대비형 제목엔 길드가 둘이라 여기선 못 가린다).
  const firstFlagForm = /\}의 첫 깃발/.test(h);
  if (ctx.debutGuilds && !firstFlagForm && DEBUT.test(plain) && guilds.length > 0 && !guilds.some((g) => ctx.debutGuilds!.includes(g))) {
    issues.push(`제목의 '첫 등장·대륙에 이름'은 첫 등장 길드에만 쓴다: 「${h}」`);
  }
  if (/첫 깃발/.test(plain) && ctx.debutGuilds) {
    const first = h.match(/\{g\|([^}|]+)(?:\|[^}]*)?\}의 첫 깃발/)?.[1]?.trim();
    if (first && !ctx.debutGuilds.includes(first)) issues.push(`제목의 '{g|${first}}의 첫 깃발'은 첫 등장 길드가 아니다: 「${h}」`);
  }
  if (ALLIANCE.test(plain) && guilds.length >= 2) issues.push(`제목에 길드 사이 동맹 표현을 썼다: 「${h}」`);
  if (ctx.sweepGuilds && SWEEP.test(plain) && guilds.length > 0 && !guilds.some((g) => ctx.sweepGuilds!.includes(g))) {
    issues.push(`제목의 석권·전역 표현은 석권 현황에 나온 길드에만 쓴다: 「${h}」`);
  }
  return issues;
}
