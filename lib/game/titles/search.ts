/**
 * 칭호 이름 검색(2026-10-29, 꿈나라 #XpsWNlNf 건의 · 시안 1 상시 입력창 확정) — 순수 모듈(테스트 tests/titles/search.test.ts).
 * 범위는 **이름만**(사용자 확정): 획득 조건 문장·분류는 보지 않는다. 띄어쓰기·대소문자는 무시해
 * '불의정점'으로 '불의 정점'을, 'pumpkin'으로 'PUMPKIN KING'을 찾는다. 초성 검색은 없다.
 * 이름은 공개 defs에 있으므로 서버 호출 없이 클라이언트 필터로 끝난다.
 */
export const TITLE_SEARCH_MAX = 20;

/** 띄어쓰기 제거 + 소문자 — 검색어와 라벨 양쪽에 같은 정규화를 적용한다. */
export function normalizeTitleQuery(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/** nq는 normalizeTitleQuery를 거친 검색어 — 비면 전부 일치(검색 없음). */
export function titleNameMatches(label: string, nq: string): boolean {
  return nq === '' || normalizeTitleQuery(label).includes(nq);
}

/**
 * 미발견(회색) 행의 일치 글자 강조용 분할 — 라벨에 검색어가 **그대로**(대소문자만 무시) 들어 있을 때만 [앞, 일치, 뒤].
 * 띄어쓰기를 건너뛴 일치('불의정점' ↔ '불의 정점')는 원문 위치가 어긋나므로 강조하지 않는다(null) — 목록엔 남는다.
 */
export function splitTitleMatch(label: string, q: string): [string, string, string] | null {
  const needle = q.trim();
  if (!needle) return null;
  const i = label.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return null;
  return [label.slice(0, i), label.slice(i, i + needle.length), label.slice(i + needle.length)];
}
