/**
 * 아바타 순서 편집(2026-09-15) — 순수 계획 함수. 화면은 id 배열만 들고 있다가 완료 때 통째로 보낸다.
 *
 * 이동은 네 가지(맨 앞으로·앞으로·뒤로·맨 뒤로). 움직일 수 없으면(이미 끝·모르는 id) **같은 배열을
 * 그대로** 돌려줘 호출부가 참조 비교로 "변경 없음"을 안다. 새 배열을 만드는 경우에만 실제로 바뀐 것.
 */
export type MoveDir = 'first' | 'prev' | 'next' | 'last';

/** 이 방향으로 움직일 수 있는가 — 버튼 톤(비활성) 판정. */
export function canMove(ids: readonly string[], id: string, dir: MoveDir): boolean {
  const i = ids.indexOf(id);
  if (i < 0) return false;
  return dir === 'first' || dir === 'prev' ? i > 0 : i < ids.length - 1;
}

/** id를 dir로 옮긴 새 배열. 못 움직이면 입력 배열 그대로. */
export function move(ids: readonly string[], id: string, dir: MoveDir): readonly string[] {
  if (!canMove(ids, id, dir)) return ids;
  const i = ids.indexOf(id);
  const rest = ids.filter((x) => x !== id);
  const at = dir === 'first' ? 0 : dir === 'last' ? rest.length : dir === 'prev' ? i - 1 : i + 1;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** 두 순서가 같은가 — 완료 때 서버 호출 생략 판정. */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
