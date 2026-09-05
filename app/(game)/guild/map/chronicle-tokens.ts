import { josa } from 'es-hangul';

/**
 * 연대기 마커 파싱 공용(2026-07-16, WorldMapView에서 분리) — 정적 렌더(ChronicleText)와
 * 리플레이 타이핑(ChronicleReplay)이 동일 파서를 공유해 표기가 어긋나지 않게 한다.
 * \}+ — AI가 닫는 중괄호를 겹쳐 쓰는 경우({z|왕성}}) 여분까지 흡수.
 */
export const CHRONICLE_TOKEN_RE = /\{([guz])\|([^}|]+)(?:\|([^}]+))?\}+/g;

// 마커 직후 조사 보정용 — AI가 쓴 한쪽 조사를 이름 받침에 맞게 교정(은↔는 등).
// 긴 조사부터 검사(으로부터>로>... 접두 충돌 방지). es-hangul josa.pick으로 정확 산출.
const JOSA_PARTICLES: { p: string; pair: Parameters<typeof josa>[1] }[] = [
  { p: '으로부터', pair: '으로부터/로부터' }, { p: '로부터', pair: '으로부터/로부터' },
  { p: '으로서', pair: '으로서/로서' }, { p: '로서', pair: '으로서/로서' },
  { p: '으로써', pair: '으로써/로써' }, { p: '로써', pair: '으로써/로써' },
  { p: '이에요', pair: '이에요/예요' }, { p: '예요', pair: '이에요/예요' },
  { p: '이란', pair: '이란/란' }, { p: '란', pair: '이란/란' },
  { p: '이랑', pair: '이랑/랑' }, { p: '랑', pair: '이랑/랑' },
  { p: '이나', pair: '이나/나' }, { p: '나', pair: '이나/나' },
  { p: '이라', pair: '이라/라' }, { p: '라', pair: '이라/라' },
  { p: '으로', pair: '으로/로' }, { p: '로', pair: '으로/로' },
  { p: '은', pair: '은/는' }, { p: '는', pair: '은/는' },
  { p: '이', pair: '이/가' }, { p: '가', pair: '이/가' },
  { p: '을', pair: '을/를' }, { p: '를', pair: '을/를' },
  { p: '와', pair: '와/과' }, { p: '과', pair: '와/과' },
  { p: '아', pair: '아/야' }, { p: '야', pair: '아/야' },
];

/** 마커(name) 직후 텍스트(after)의 선두 조사를 이름 받침에 맞게 교정. 교정 조사 + 소비 길이 반환(없으면 null). */
export function fixLeadingJosa(name: string, after: string): { josa: string; len: number } | null {
  for (const { p, pair } of JOSA_PARTICLES) {
    if (!after.startsWith(p)) continue;
    // 조사 뒤가 한글 음절이면 단어 일부일 수 있어 보정 안 함(공백·문장부호·끝만 조사로 인정).
    const next = after[p.length];
    if (next !== undefined && /[가-힣]/.test(next)) return null;
    return { josa: josa.pick(name, pair), len: p.length };
  }
  return null;
}

export type ChronicleSegment =
  | { kind: 'text'; text: string }
  | { kind: 'g' | 'u' | 'z'; text: string; name: string; code?: string };

/**
 * 구역 표시명 해소 — 구역은 '장소'라서, 개명되면 과거 기록도 **현재 이름**으로 보여야 지도와
 * 어긋나지 않는다(0135 '잊힌 신전'→'설원 신전'). 길드·인물은 반대다(그날 이름이 정답).
 * 반환값이 undefined면 토큰에 적힌 이름을 그대로 쓴다. 조사 보정도 해소된 이름 기준으로 한다.
 */
export type ChronicleResolve = { zoneName?: (zoneId: number) => string | undefined };

/** 마커 텍스트 → 세그먼트 배열(조사 보정 포함) — 정적/타이핑 렌더 공용 파서. */
export function parseChronicleSegments(
  text: string,
  resolve?: ChronicleResolve,
): ChronicleSegment[] {
  const out: ChronicleSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(CHRONICLE_TOKEN_RE)) {
    const mIndex = m.index ?? 0;
    if (mIndex > last) out.push({ kind: 'text', text: text.slice(last, mIndex) });
    const kind = m[1] as 'g' | 'u' | 'z';
    const code = m[3];
    const name = displayName(kind, m[2]!, code, resolve);
    out.push({ kind, text: name, name, code });
    last = mIndex + m[0].length;
    const fixed = fixLeadingJosa(name, text.slice(last));
    if (fixed) {
      out.push({ kind: 'text', text: fixed.josa });
      last += fixed.len;
    }
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** 토큰의 표시 이름 — 구역만 현재 이름으로 해소(위 ChronicleResolve 주석의 이유). */
export function displayName(
  kind: 'g' | 'u' | 'z',
  raw: string,
  code: string | undefined,
  resolve?: ChronicleResolve,
): string {
  if (kind !== 'z' || !code || !resolve?.zoneName) return raw;
  const id = Number(code);
  if (!Number.isInteger(id)) return raw;
  return resolve.zoneName(id) ?? raw;
}

/**
 * 과거 회고 문장 가드(2026-09-01) — "어제 {z|잿더미 폐허}와 {z|불탄 마을}을 손에 넣었던 …" 처럼 지난 점령전을
 * 되짚는 문장 안의 구역 마커는 리플레이 트리거로 쓰지 않는다. 트리거는 "첫 등장 1회"라 회고에서 먼저
 * 소비되면 오늘 사건 연출이 실제 서술보다 앞서 터지고, 그 문장에선 아무 일도 안 일어난다(리플레이 꼬임).
 * 반환: 건너뛸 세그먼트 키 `${p}:${s}` 집합. 같은 구역이 뒤에서 다시 언급되면 그때 재생되고, 없으면 종료
 * 일괄 발화가 받는다. 문장 경계는 '. ' / '! ' / '? '(문단 끝 포함).
 */
export const PAST_CONTEXT_RE = /어제|전날|그저께|지난\s?(날|밤|점령전|전투|번)/;

/** 회고 문장 안의 구역 마커 키 전부(필터 없음) — 서버 검증(replayOrderIssues)이 '회고에만 등장한 구역'을 잡는 데 쓴다. */
export function pastContextZoneKeysRaw(paras: ChronicleSegment[][]): Set<string> {
  const out = new Set<string>();
  const ENDS = ['. ', '! ', '? '];
  for (let p = 0; p < paras.length; p++) {
    const segs = paras[p]!;
    const full = segs.map((x) => x.text).join('');
    let off = 0;
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s]!;
      if (seg.kind === 'z') {
        // 문장 시작: 앞쪽 가장 가까운 경계 뒤. 경계가 없으면 문단 처음(0) — lastIndexOf 미발견(-1)에
        // +2를 하면 1이 되어 문단이 "어제 …"로 시작할 때 첫 글자를 놓친다(2026-09-02 수정).
        const starts = ENDS.map((b) => full.lastIndexOf(b, off)).filter((i) => i >= 0);
        const sStart = starts.length ? Math.max(...starts) + 2 : 0;
        const after = off + seg.text.length;
        const ends = ENDS.map((b) => full.indexOf(b, after)).filter((i) => i >= 0);
        const sEnd = ends.length ? Math.min(...ends) + 1 : full.length;
        if (PAST_CONTEXT_RE.test(full.slice(sStart, sEnd))) out.add(`${p}:${s}`);
      }
      off += seg.text.length;
    }
  }
  return out;
}

/**
 * 리플레이가 실제로 건너뛸 회고 마커 — 위 raw 집합에서 **그 구역이 다른(회고 아닌) 문장에도 마커로 등장하는 경우만**
 * 남긴다(2026-09-05 사용자 결정). 회고 문장에만 나오는 구역은 건너뛰면 문단 끝까지 전투가 밀리므로, 다른 곳처럼
 * 언급 즉시 재생하는 쪽이 낫다. 회고+본문 둘 다 있는 구역만 본문 쪽에서 재생한다(09-01 꼬임 방지 유지).
 */
export function findPastContextZoneKeys(paras: ChronicleSegment[][]): Set<string> {
  const raw = pastContextZoneKeysRaw(paras);
  if (raw.size === 0) return raw;
  const hasNonPast = new Set<string>();
  paras.forEach((segs, p) =>
    segs.forEach((seg, s) => {
      if (seg.kind === 'z' && !raw.has(`${p}:${s}`)) hasNonPast.add(seg.text);
    }),
  );
  const out = new Set<string>();
  paras.forEach((segs, p) =>
    segs.forEach((seg, s) => {
      if (seg.kind === 'z' && raw.has(`${p}:${s}`) && hasNonPast.has(seg.text)) out.add(`${p}:${s}`);
    }),
  );
  return out;
}
