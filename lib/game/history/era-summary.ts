import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { unstable_cache } from 'next/cache';

/**
 * 시대 요약 이야기(2026-09-18) — 코드가 뽑은 시대 사실(누가 언제 앞자리에 섰고, 무엇을 석권했고, 누가 사라졌고,
 * 어떻게 끝났는지)을 연대기와 같은 이야기꾼 목소리로 3~5문장으로 풀어 쓴다. 사용자 피드백: 집계 문장 그대로는
 * "딱딱하고 재미없다".
 *
 * 안전장치 — 사실은 여기 준 것만 쓰게 하고, 결과를 코드가 검사한다(길드 마커는 허용 목록만, 아라비아 숫자는 사실표의
 * 수만, 등수·줄표·이모지 금지, 길이). 하나라도 어긋나면 집계 문장(fallback)으로 돌아간다. 검수 없이 자동 공개되는
 * 글이라 검증을 통과한 것만 내보낸다.
 *
 * 캐시 — Next 데이터 캐시(unstable_cache)에 사실표 전체를 키로 하루 보관. 끝난 시대는 사실이 변하지 않아 배포당 한 번,
 * 진행 중인 시대는 날마다 한 번 생성된다. DB에 쓰지 않으므로 읽기 전용 스코프(스테이징)에서도 동작한다.
 */
export type EraFacts = {
  index: number;
  /** 장 첫날 기준 이름(장 제목과 같다). */
  leader: string;
  /** 장 마지막 날의 이름 — 장 안에서 개명했으면 새 이름(최대 영토·맺음의 주어). */
  leaderAtEnd: string;
  from: string;
  to: string;
  days: number;
  ongoing: boolean;
  /** 직전 시대의 주인(첫 장이면 null)과 그날의 구역 수 차이. */
  prevLeader: string | null;
  margin: number;
  renames: { day: string; before: string; after: string }[];
  /** 석권 — 날짜순. 같은 길드가 여러 지역이면 지역마다 한 줄. */
  sweeps: { day: string; guild: string; region: string }[];
  /** 주인 길드의 최대 보유(시대 첫날보다 늘었을 때만)와 그날. */
  peak: number | null;
  peakDay: string | null;
  /** 장이 끝날 때까지 돌아오지 않은 소멸 — 날짜와 길드. */
  vanished: { day: string; guild: string }[];
  /** 시대가 끝났을 때 — 다음 주인과 넘겨줄 때의 보유 수(주인 최대 → 다음 시대 첫날 보유). */
  closing: { next: string; peak: number; to: number } | null;
  /** 그 시대 날들의 헤드라인(마커 유지) — 분위기 참고용. 여기 마커로 나온 길드는 요약에서도 마커로 쓸 수 있다. */
  headlines: string[];
};

export type EraNarrative = { summary: string; closing: string };

const MODEL_ID = 'claude-sonnet-5';
let _client: Anthropic | null = null;
function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return (_client ??= new Anthropic({ apiKey: key }));
}

const SYSTEM = `너는 대륙의 정복 전쟁을 듣는 이에게 들려주는 이야기꾼이다. 지금은 한 시대(한 길드가 대륙에서 가장 넓은 영토를 쥐고 있던 기간)를 책의 한 장(章)처럼 여는 글을 쓴다.

규칙:
- 한국어. 듣는 사람에게 들려주듯 자연스러운 구어체. 담담하되 흐름이 있게. 과장·감탄·미사여구·영웅 서사시 금지.
- '— '(줄표·대시)를 쓰지 않는다. 이모지·이모티콘 금지. '인생강화'라는 단어 금지.
- 등수 표현(1위·2위·순위·선두·1등) 금지. '가장 넓은 영토', '앞자리', '대륙의 주인' 같은 질적 표현으로.
- 길드 이름은 등장할 때마다 반드시 {g|이름} 마커로 감싼다. [사실]에 「이름」으로 적힌 것이 곧 길드다(「」는 쓰지 말고 {g|이름}으로). 철자는 그대로, 마커 안에는 이름만 넣고 조사는 밖에 이름의 받침에 맞춰 붙인다({g|전설}이, {g|로제}가, {g|Winners}가). 구역·인물 마커({z|}, {u|})는 쓰지 않는다. 지역 이름(왕국·드래곤 화산·잊힌 신전·슬라임 늪·오크 부락·타락 천사 부유섬)은 마커 없이 그대로.
- [사실]에 있는 것만 쓴다. 숫자(날짜·일수·구역 수)는 [사실]의 것만 그대로 쓰고 새 숫자를 만들지 않는다. '며칠 지나지 않아·오랜 다툼 끝에'처럼 [사실]에 없는 간격·경위를 덧붙이지 않는다. 헤드라인에서는 사건의 결(누가 무엇을 삼켰고 되찾았고 사라졌는지)과 분위기를 빌려 와도 되지만, 숫자를 옮기지는 않는다. 헤드라인의 길드는 거기 적힌 마커 그대로 쓴다.
- 시대의 이름이 바뀐 길드는 [사실]의 개명 항목대로 한 번만 잇고, 그 뒤로는 새 이름으로 부른다.
- 시각·시간대 표현(아침·밤·자정 등) 금지.
- 유혈·잔혹 묘사 금지. '사라졌다·밀려났다·내주었다' 수준으로.

출력은 JSON 하나만: {"summary": string, "closing": string}
- summary: 이 시대를 여는 글. 4~6문장, 200~380자. 첫 문장은 시대가 어떻게 시작됐는지(누가 누구를 밀어내고 앞자리에 섰는지, 첫 장이면 첫 깃발), 이어서 그 시대에 있었던 일(석권·최대 영토·개명·사라진 길드·헤드라인에 남은 굵직한 사건), 있는 것만. 나열이 아니라 흐름이 있는 이야기로. **사건은 [사실]의 날짜 순서대로** 쓴다(최대 영토가 개명 뒤라면 개명을 먼저). **시대가 어떻게 끝났는지(누구에게 넘겼는지, 마지막 보유 수)는 summary에 쓰지 않는다** — 그건 closing의 몫이라 겹치면 같은 말이 두 번 나온다.
- closing: [사실]에 '끝'이 있을 때만 한 문장(며칠 만에 누구에게 넘겼는지, 보유 수 변화). 없으면 빈 문자열.`;

const FORBIDDEN = /1위|2위|3위|순위|선두|1등|—|인생강화|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const GUILD_MARKER = /\{g\|([^}|]+)\}/g;

/** 결과 검증 — 통과 못 하면 이유를 돌려준다(null = 통과). */
export function allowedGuildNames(facts: EraFacts): Set<string> {
  const names = new Set<string>([
    facts.leader,
    facts.leaderAtEnd,
    ...(facts.prevLeader ? [facts.prevLeader] : []),
    ...facts.renames.flatMap((r) => [r.before, r.after]),
    ...facts.sweeps.map((s) => s.guild),
    ...facts.vanished.map((v) => v.guild),
    ...(facts.closing ? [facts.closing.next] : []),
  ]);
  for (const h of facts.headlines) for (const m of h.matchAll(GUILD_MARKER)) names.add(m[1]!.trim());
  return names;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 이름 뒤에 올 수 있는 조사 — 이게 붙거나 바로 끝나야 길드 이름으로 본다('전설적인'의 '전설'은 길드가 아니다). */
const PARTICLE = '(?:으로|에게|에서|까지|부터|처럼|이라는|라는|이|가|은|는|을|를|의|와|과|도|로|에|만)?';
function bareNameRe(name: string): RegExp {
  return new RegExp(`(?<![가-힣A-Za-z0-9])${esc(name)}(?=${PARTICLE}(?![가-힣A-Za-z0-9]))`, 'g');
}
/** 마커 밖 구간에만 fn을 적용한다. */
function mapOutsideMarkers(text: string, fn: (s: string) => string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/\{[guz]\|[^}]*\}/g)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + fn(text.slice(last));
}

/**
 * 표기 교정 — 「이름」과 마커 없이 적힌 길드 이름(조사가 붙거나 단어 끝인 것만)을 {g|이름}으로.
 * 이름이 보통 낱말이기도 한 길드('전설')가 매번 '마커 누락'으로 탈락하던 문제(09-18) — 길드로 쓰인 자리만 감싼다.
 */
export function repairMarkers(text: string, facts: EraFacts): string {
  const names = [...allowedGuildNames(facts)].sort((a, b) => b.length - a.length);
  let t = text.replace(/「([^」]+)」/g, (m, nm: string) => (names.includes(nm.trim()) ? `{g|${nm.trim()}}` : m));
  for (const nm of names) {
    if (nm.length < 2) continue;
    t = mapOutsideMarkers(t, (seg) => seg.replace(bareNameRe(nm), `{g|${nm}}`));
  }
  return t;
}

export function validateNarrative(text: string, facts: EraFacts, kind: 'summary' | 'closing'): string | null {
  if (kind === 'closing') {
    if (!facts.closing) return text.trim() === '' ? null : 'closing without end';
    if (text.trim() === '') return 'empty closing';
  }
  if (kind === 'summary' && (text.length < 60 || text.length > 480)) return `length ${text.length}`;
  if (kind === 'closing' && text.length > 180) return `closing length ${text.length}`;
  if (FORBIDDEN.test(text)) return 'forbidden word';
  if (/\{[zu]\|/.test(text)) return 'zone/user marker';
  if (/[「」]/.test(text)) return 'bracket name';
  const allowedNames = allowedGuildNames(facts);
  for (const m of text.matchAll(GUILD_MARKER)) if (!allowedNames.has(m[1]!.trim())) return `unknown guild ${m[1]}`;
  // 마커 없이 적힌 길드명 — 길드로 쓰인 자리(조사·단어 끝)만 본다. 교정(repairMarkers)을 거친 뒤라 보통은 남지 않는다.
  const plain = text.replace(GUILD_MARKER, ' ');
  for (const nm of allowedNames) if (nm.length >= 2 && bareNameRe(nm).test(plain)) return `unmarked guild ${nm}`;
  const allowedNumbers = new Set<number>();
  const pushDate = (d: string) => {
    allowedNumbers.add(Number(d.slice(5, 7)));
    allowedNumbers.add(Number(d.slice(8, 10)));
  };
  pushDate(facts.from);
  pushDate(facts.to);
  for (const r of facts.renames) pushDate(r.day);
  for (const s of facts.sweeps) pushDate(s.day);
  if (facts.peakDay) pushDate(facts.peakDay);
  for (const v of facts.vanished) pushDate(v.day);
  allowedNumbers.add(facts.days);
  allowedNumbers.add(facts.margin);
  allowedNumbers.add(facts.index);
  if (facts.peak != null) allowedNumbers.add(facts.peak);
  if (facts.closing) {
    allowedNumbers.add(facts.closing.peak);
    allowedNumbers.add(facts.closing.to);
  }
  for (const m of plain.matchAll(/\d+/g)) if (!allowedNumbers.has(Number(m[0]))) return `unknown number ${m[0]}`;
  // 날짜 순서 — 'N월 M일'이 앞뒤로 거꾸로 나오면 이야기 흐름이 꼬인다(09-18 검수: 9월 10일 개명 뒤에 9월 8일 개명).
  let prevKey = 0;
  for (const m of plain.matchAll(/(\d{1,2})월\s?(\d{1,2})일/g)) {
    const key = Number(m[1]) * 100 + Number(m[2]);
    if (key < prevKey) return `date order ${m[0]}`;
    prevKey = key;
  }
  // 우리말 수사로 센 구역 수('네 곳')는 사실표의 수이거나 헤드라인에 그대로 있는 표현만.
  const headlineText = facts.headlines.join('\n');
  for (const m of plain.matchAll(KO_COUNT)) {
    if (!m[1] && !m[2]) continue; // '몇 곳·곳곳'처럼 수사가 없는 '곳'
    const n = (m[1] ? TENS[m[1]]! : 0) + (m[2] ? UNITS[m[2]]! : 0);
    if (!allowedNumbers.has(n) && !headlineText.includes(m[0].trim())) return `unknown count ${m[0].trim()}`;
  }
  return null;
}
const UNITS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
const TENS: Record<string, number> = { 열: 10, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50 };
const KO_COUNT = /(스물|서른|마흔|쉰|열)?(한|두|세|네|다섯|여섯|일곱|여덟|아홉)?\s?곳/g;

const hasBatchim = (s: string) => {
  const c = s.charCodeAt(s.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const josa = (name: string, pair: [string, string]) => (hasBatchim(name) ? pair[0] : pair[1]);

function factLines(f: EraFacts): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const G = (nm: string, pair?: [string, string]) => `「${nm}」${pair ? josa(nm, pair) : ''}`;
  const L: string[] = [];
  L.push(`제${f.index}장: 주인 길드 ${G(f.leader)}, ${md(f.from)}부터 ${f.ongoing ? '지금까지' : `${md(f.to)}까지`} ${f.days}일${f.ongoing ? ' (진행 중)' : ''}`);
  if (f.prevLeader) L.push(`시작: ${md(f.from)}, ${G(f.leader, ['이', '가'])} ${G(f.prevLeader, ['을', '를'])} 제치고 가장 넓은 영토를 쥠${f.margin <= 1 ? ' (한 곳 차이)' : ''}`);
  else L.push(`시작: ${md(f.from)} 첫 점령전에서 ${G(f.leader, ['이', '가'])} 대륙에서 가장 넓은 영토를 쥠`);
  // 날짜순 연표 하나로 — 종류별로 묶어 주면 모델이 종류별로 쓰며 날짜가 뒤섞였다(09-18: 9월 10일 개명 뒤 9월 8일 개명).
  const timeline: { day: string; order: number; text: string }[] = [];
  for (const r of f.renames) timeline.push({ day: r.day, order: 1, text: `개명 — ${G(r.before, ['은', '는'])} ${G(r.after, ['으로', '로'])} 이름을 바꿈(같은 길드)` });
  for (const s of f.sweeps) timeline.push({ day: s.day, order: 2, text: `석권 — ${G(s.guild, ['이', '가'])} ${s.region} 전체를 손에 넣음` });
  if (f.peak != null && f.peakDay) {
    const who = f.renames.some((r) => r.before === f.leader && r.day <= f.peakDay!) ? f.leaderAtEnd : f.leader;
    timeline.push({ day: f.peakDay, order: 3, text: `최대 영토 — ${G(who, ['이', '가'])} ${f.peak}곳을 쥠(이 장의 최대)` });
  }
  for (const v of f.vanished) timeline.push({ day: v.day, order: 4, text: `소멸 — ${G(v.guild, ['이', '가'])} 마지막 구역을 잃고 대륙에서 사라짐` });
  timeline.sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order);
  if (timeline.length > 0) {
    L.push('연표(날짜순 — 이 순서대로 쓸 것):');
    for (const e of timeline) L.push(`· ${md(e.day)} ${e.text}`);
  }
  if (f.closing) L.push(`끝: ${f.days}일 만에 ${G(f.leaderAtEnd, ['이', '가'])} ${G(f.closing.next)}에게 가장 넓은 영토를 내줌. ${G(f.leaderAtEnd)}의 영토는 ${f.closing.peak}곳에서 ${f.closing.to}곳으로`);
  return L.join('\n');
}

/**
 * 응답 JSON — 모델이 문자열 안에 줄바꿈을 그대로 넣어 JSON.parse가 실패하는 일이 잦다(09-18 첫 장 실측).
 * 정상 JSON을 먼저 시도하고, 안 되면 "summary"·"closing" 값을 직접 뽑는다.
 */
export function parseNarrativeJson(raw: string): { summary?: unknown; closing?: unknown } | null {
  const body = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
  try {
    return JSON.parse(body) as { summary?: unknown; closing?: unknown };
  } catch {
    /* 아래 수동 추출 */
  }
  const pick = (key: string): string | undefined => {
    const m = body.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return undefined;
    return m[1]!.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\s*\n\s*/g, ' ');
  };
  const summary = pick('summary');
  if (summary === undefined) return null;
  return { summary, closing: pick('closing') ?? '' };
}

export async function narrateEraUncached(facts: EraFacts): Promise<EraNarrative | null> {
  // 검증 탈락 시 이유를 알려 주고 한 번 더 쓴다 — 그래도 안 되면 집계 문장.
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await narrateOnce(facts, feedback);
    if (r.ok) return r.value;
    if (!r.reason) return null;
    feedback = r.reason;
  }
  console.warn('[history.era] 요약 검증 두 번 실패 → 집계 문장 유지:', feedback);
  return null;
}

const REASON_KO: Record<string, string> = {
  'date order': '날짜가 앞뒤로 거꾸로 나왔다 — 사건을 날짜 순서대로 다시 배열하라',
  'unknown number': '[사실]에 없는 숫자를 썼다 — 숫자는 [사실]의 것만',
  'unknown count': "[사실]에 없는 '곳' 수를 썼다",
  'unknown guild': '[사실]에 없는 길드를 마커로 썼다',
  'unmarked guild': '길드 이름을 마커 없이 썼다 — 모든 길드 이름을 {g|이름}으로',
  length: '길이가 맞지 않는다 — summary는 200~380자',
  'forbidden word': '금지 표현(등수·줄표·이모지)을 썼다',
  'bracket name': '「」 표기를 그대로 썼다 — {g|이름} 마커로',
};

async function narrateOnce(facts: EraFacts, feedback: string): Promise<{ ok: true; value: EraNarrative } | { ok: false; reason: string | null }> {
  const userContent =
    `[사실 — 이것만 근거로]\n${factLines(facts)}\n\n[그 시대 날들의 헤드라인 — 사건의 결과 분위기 참고용, 숫자는 옮기지 말 것]\n${facts.headlines
      .slice(0, 30)
      .map((h) => `· ${h}`)
      .join('\n')}\n\n${feedback ? `[직전 초안의 문제 — 고쳐서 다시 쓸 것]\n${REASON_KO[Object.keys(REASON_KO).find((k) => feedback.startsWith(k)) ?? ''] ?? feedback}\n\n` : ''}JSON으로만 답하라.`;
  const res = await client().messages.create({
    model: MODEL_ID,
    // 첫 장은 사실이 많아(개명 셋·석권 넷·소멸 셋) 700이면 JSON이 잘린다(09-18 실측).
    max_tokens: 1400,
    // Sonnet 5는 thinking 미지정 시 adaptive 기본 — 예산을 thinking이 다 써 본문이 비었다(09-18: stop=max_tokens, blocks=thinking). 연대기와 같이 끈다.
    thinking: { type: 'disabled' },
    system: SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });
  const raw = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const parsed = parseNarrativeJson(raw);
  if (!parsed) {
    console.warn(
      '[history.era] 응답 JSON 파싱 실패:',
      `stop=${res.stop_reason} blocks=${res.content.map((b) => b.type).join(',')} len=${raw.length}`,
      raw.slice(0, 80),
    );
    return { ok: false, reason: null };
  }
  const summary = repairMarkers(typeof parsed.summary === 'string' ? parsed.summary.trim() : '', facts);
  const closing = repairMarkers(typeof parsed.closing === 'string' ? parsed.closing.trim() : '', facts);
  const bad = validateNarrative(summary, facts, 'summary') ?? validateNarrative(closing, facts, 'closing');
  if (bad) {
    console.warn('[history.era] 요약 검증 실패:', bad);
    return { ok: false, reason: bad };
  }
  return { ok: true, value: { summary, closing } };
}

const narrateEraCached = unstable_cache(
  async (factsJson: string) => narrateEraUncached(JSON.parse(factsJson) as EraFacts),
  ['history-era-narrative-v5'],
  { revalidate: 60 * 60 * 24 },
);

/** 캐시 경유 — 키 없음·실패·검증 탈락은 null(호출부가 집계 문장을 유지). */
export async function narrateEra(facts: EraFacts): Promise<EraNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    // 로컬 점검 스크립트(Next 런타임 밖)는 데이터 캐시가 없어 직접 호출.
    if (process.env.HISTORY_ERA_NO_CACHE === '1') return await narrateEraUncached(facts);
    return await narrateEraCached(JSON.stringify(facts));
  } catch (e) {
    console.warn('[history.era] 요약 생성 실패 → 집계 문장 유지:', (e as Error).message);
    return null;
  }
}
