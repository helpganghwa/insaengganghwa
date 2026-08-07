import Link from 'next/link';

/** 오프셋 페이지네이션 — 이전/다음 링크만(총건수 count는 검수엔 불필요, 비용만 든다). */
export function Pager({
  page,
  prevHref,
  nextHref,
}: {
  page: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  if (!prevHref && !nextHref) return null;
  const cls = 'rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300';
  return (
    <div className="flex items-center justify-center gap-2 pt-1">
      {prevHref ? (
        <Link prefetch={false} href={prevHref} className={cls}>
          ← 이전
        </Link>
      ) : (
        <span className={`${cls} opacity-30`}>← 이전</span>
      )}
      <span className="text-xs tabular-nums text-zinc-500">{page + 1}쪽</span>
      {nextHref ? (
        <Link prefetch={false} href={nextHref} className={cls}>
          다음 →
        </Link>
      ) : (
        <span className={`${cls} opacity-30`}>다음 →</span>
      )}
    </div>
  );
}
