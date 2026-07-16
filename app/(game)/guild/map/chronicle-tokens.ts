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

/** 마커 텍스트 → 세그먼트 배열(조사 보정 포함) — 정적/타이핑 렌더 공용 파서. */
export function parseChronicleSegments(text: string): ChronicleSegment[] {
  const out: ChronicleSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(CHRONICLE_TOKEN_RE)) {
    const mIndex = m.index ?? 0;
    if (mIndex > last) out.push({ kind: 'text', text: text.slice(last, mIndex) });
    const kind = m[1] as 'g' | 'u' | 'z';
    const name = m[2]!;
    out.push({ kind, text: name, name, code: m[3] });
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
