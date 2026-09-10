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
 *  6. 반복 — '하루 만에'·'어제 … 내주었던'·'다시 노렸다'는 본문 전체에서 한 번까지, 회고 문장은 세 문장까지.
 *  7. 산수 — 길드 하나만 나오는 문장의 'N곳'은 그 길드의 얻은 수·잃은 수·현재 보유·직전 보유 중 하나여야 한다.
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
  /** 인원수 서술이 허용되는 구역 — '가장 많은 사람이 몰린 전투' + '열세 방어'(2026-09-10). */
  headcountZones: string[];
  /** '되찾다'류가 허용되는 구역(어제 잃은 길드가 오늘 그 구역을 노림). */
  recaptureZones: string[];
  /** 어제 기록(점령·방어)이 있는 구역 — 회고 표현 허용 범위. */
  yesterdayZones: string[];
  /** 길드 → 문장에 나올 수 있는 '곳' 수(얻음·잃음·현재·직전). 없으면 검사 생략. */
  guildCounts: Map<string, number[]>;
};

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
    out.push((m[1] ? TENS[m[1]]! : 0) + (m[2] ? UNIT[m[2]]! : 0));
  }
  for (const m of plain.matchAll(/(\d+)\s?곳/g)) out.push(Number(m[1]));
  return out;
}

/** 사람 수 표현 — 수사 뒤에 '명·사람'(조사 무관) 또는 조사가 바로 붙는 꼴(둘을·셋이·일곱으로). '두 곳·세 차례·여섯 길드'는 잡지 않는다. */
const HEADCOUNT = /(?<![가-힣])(?:(?:하나|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|둘|셋|넷)\s?(?:명|사람)|(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)(?:이|을|를|의|은|도|만|과|와|으로|로|가)(?![가-힣]))/g;

/** 마커를 같은 길이의 공백으로 바꾼 평문 — 정규식 위치를 마커 위치와 맞대어 '그 표현이 어느 구역 뒤에 나왔는지' 잡는다. */
function plainAligned(s: string): string {
  return s.replace(MARKER, (m) => ' '.repeat(m.length));
}

const RECAPTURE = /되찾|탈환|수복|되돌려|돌려받|도로 가져|다시 가져|다시 손에/;
const RETRO = /어제|전날/;

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
      }

      // 2. 인원수
      const heads = [...aligned.matchAll(HEADCOUNT)].filter((m) => {
        const z = zoneAt(m.index!);
        return !(z && headcount.has(z));
      }).map((m) => m[0].trim());
      if (heads.length > 0) {
        issues.push(
          `사람 수 표현(${heads.join(', ')})은 인원수가 허용된 전투${ctx.headcountZones.length ? `(${ctx.headcountZones.join(', ')})` : '(이번엔 없음)'} 문맥에서만 쓴다 — 이 문장에서는 인원수를 빼고 '수비를 세워·수비를 뚫고'처럼 쓴다: ${q(sent)}`,
        );
      }

      // 3. 지역 — 구역 마커 앞에 나온 마지막 지역 언급이 그 구역을 지배한다("잊힌 신전에서는 … {z|X}", "오크 부락의 {z|Y}").
      //    '같은 지역의 {z|Z}'는 앞선 지역 언급(없으면 앞 문장에서 이어진 지역)과 같아야 한다.
      const mentions = regionMentions(aligned, aliases);
      const regions = [...new Set(mentions.map((m) => m.label))];
      const sameRegionAt = [...aligned.matchAll(/같은 (지역|화산|늪|부락|신전|섬|왕국)/g)].map((m) => m.index!);
      for (const zp of zonePos) {
        const r = ctx.zoneRegion.get(zp.name);
        if (!r) continue;
        let governing: string | null = null;
        for (const m of mentions) if (m.at < zp.at) governing = m.label;
        const viaSame = sameRegionAt.some((at) => at < zp.at && !mentions.some((m) => m.at > at && m.at < zp.at));
        if (viaSame && !governing) governing = lastRegion;
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
          for (const n of parseZoneCounts(plain)) {
            if (!allowed.includes(n)) {
              issues.push(`{g|${guilds[0]}} 의 구역 수 '${n}곳'이 사실표와 다르다(가능한 수: ${[...new Set(allowed)].join('·')}) — '길드별 보유 증감'대로 고친다: ${q(sent)}`);
            }
          }
        }
      }

      if (zones.length > 0) lastZone = zones[zones.length - 1]!;
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
  if (retroSentences > 3) issues.push(`'어제·전날' 회고 문장이 ${retroSentences}개다 — 세 문장 이하로 줄이고 나머지 연속성은 회고 표현 없이 잇는다.`);

  return [...new Set(issues)];
}
