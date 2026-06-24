/**
 * 프로필 상세 링크 — **항상 공개코드(publicCode) + 서버(serverId)**.
 *
 * 닉네임은 서버별·변경 가능이라 불안정 → publicCode로 식별, 서버는 ?s로 명시(프로필은 서버 단위).
 * serverId를 필수 인자로 받아 "코드만/닉네임만" 링크가 만들어지지 않도록 강제한다. 신규 링크는
 * 반드시 이 헬퍼를 사용할 것. (/u 페이지는 ?s 없으면 조회자 활성 서버로 폴백하나, 링크는 명시한다.)
 */
export function profileHref(publicCode: string, serverId: number): string {
  return `/u/${encodeURIComponent(publicCode)}?s=${serverId}`;
}
