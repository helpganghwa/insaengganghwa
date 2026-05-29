/**
 * (game) 공통 로딩 UI — 콜드/지연 시 흰 화면(about:blank 무한로딩) 대신 즉시 표시(2026-05-29).
 * layout 셸(헤더·하단 네비)은 자체 Suspense로 먼저 뜨고, 이 fallback은 page 본문 영역에 노출.
 * page 데이터가 준비되면 실제 콘텐츠로 교체된다.
 */
export default function GameLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="불러오는 중">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500 dark:border-zinc-700 dark:border-t-zinc-300" />
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
