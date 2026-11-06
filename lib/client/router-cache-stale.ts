/**
 * 클라이언트 라우터 캐시 '낡음' 표식(2026-11-06 업데이트 18).
 *
 * 서버 액션의 revalidatePath는 화면 재렌더와 함께 **클라 라우터 캐시 전체를 비운다**. 강화 수령에서 revalidatePath를
 * 뺀 뒤로는(재렌더 비용 제거) 그 비우기도 사라져, 뒤로/앞으로 가기로 돌아간 화면이 수령 전 캐시(레벨·진행 중 잡)를
 * 그대로 보여 줄 수 있다. 앞으로 이동(Link)은 동적 페이지라 늘 새로 받으므로 문제는 뒤로/앞으로 가기뿐이다.
 * 수령 성공 시 이 표식을 세우고, RouterCacheGuard가 다음 뒤로/앞으로 가기 직후 router.refresh 한 번으로 캐시를 비운다.
 */
let stale = false;

export function markRouterCacheStale(): void {
  stale = true;
}

/** 표식을 읽고 지운다(한 번만 refresh). */
export function takeRouterCacheStale(): boolean {
  const v = stale;
  stale = false;
  return v;
}
