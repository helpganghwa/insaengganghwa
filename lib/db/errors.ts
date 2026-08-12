/**
 * DB 드라이버 에러 판별 — SQLSTATE는 **반드시 이 모듈로만** 읽는다.
 *
 * 배경(2026-08-11): drizzle 0.45는 모든 쿼리 에러를 `DrizzleQueryError`로 감싼다. 래퍼에는
 * `code`가 없고 message도 `"Failed query: …"`라, 코드베이스 전역의 `e.code === '23505'`
 * 판별이 **업그레이드로 조용히 전부 무력화**됐다(제약 자체는 정상 작동 — 중복은 DB가 막는다.
 * 깨진 건 그 다음 처리, 즉 사용자에게 보이는 매핑뿐이라 예외가 그대로 올라가 UNKNOWN이 됐다).
 * 진짜 SQLSTATE는 `cause` 체인의 `PostgresError`에만 있으므로 체인을 따라 내려가 찾는다.
 * 같은 회귀를 되풀이하지 않도록, 새 코드도 `e.code`를 직접 읽지 말 것.
 */

/** cause 체인 탐색 상한 — 순환 참조(a.cause=b, b.cause=a) 시 무한 루프 방어. */
const MAX_CAUSE_DEPTH = 8;

/** 에러(및 그 cause 체인)에서 첫 SQLSTATE를 찾는다. 못 찾으면 undefined. */
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < MAX_CAUSE_DEPTH && cur != null; i += 1) {
    if (typeof cur !== 'object') return undefined;
    const o = cur as { code?: unknown; cause?: unknown };
    // 문자열 code만 SQLSTATE로 인정 — 숫자 code를 쓰는 래퍼가 끼어도 체인 탐색을 이어간다.
    if (typeof o.code === 'string') return o.code;
    cur = o.cause;
  }
  return undefined;
}

/** Postgres unique_violation(23505) — 유니크/부분 유니크 충돌 최후 방어의 공통 판별. */
export function isUniqueViolation(e: unknown): boolean {
  return pgErrorCode(e) === '23505';
}

/**
 * cause 체인에서 위반된 제약 이름(constraint_name) — postgres.js PostgresError의 snake_case 필드.
 *
 * 한 문장이 서로 다른 유니크 제약 여러 개에 걸릴 수 있을 때(예: characters INSERT는
 * characters_nickname_uq와 characters_pkey 둘 다 23505를 낸다) 어느 쪽인지 구분하는 용도.
 *
 * ⚠ code가 아니라 **constraint_name이 있는 노드**를 찾는다 — 커넥션 계층 에러도 문자열 code
 * ("ECONNREFUSED")를 가져서(2026-08-12 실측), code 기준으로 멈추면 엉뚱한 노드에서 끝난다.
 */
export function pgConstraintName(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < MAX_CAUSE_DEPTH && cur != null; i += 1) {
    if (typeof cur !== 'object') return undefined;
    const o = cur as { constraint_name?: unknown; cause?: unknown };
    if (typeof o.constraint_name === 'string') return o.constraint_name;
    cur = o.cause;
  }
  return undefined;
}
