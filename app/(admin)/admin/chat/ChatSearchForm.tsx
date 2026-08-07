import Link from 'next/link';

import { CHAT_BASE_PATH } from './shared';

/**
 * 검수 화면 검색창 — GET 폼(서버 컴포넌트, JS 0).
 * 현재 탭·서버 등 유지해야 할 파라미터는 hidden으로 실어 보내고, 페이지(p)는 일부러 빼
 * 새 검색이 항상 1페이지부터 시작하게 한다.
 */
export function ChatSearchForm({
  keep,
  q,
  placeholder,
  resetHref,
}: {
  keep: Record<string, string | undefined>;
  q: string;
  placeholder: string;
  resetHref: string;
}) {
  return (
    <form action={CHAT_BASE_PATH} className="flex items-center gap-2">
      {Object.entries(keep).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        // text-base(16px) — iOS 포커스 줌 방지(스케일 잠금 금지 정책).
        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-base text-zinc-100 placeholder:text-zinc-600"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-1.5 text-sm font-bold text-amber-300"
      >
        검색
      </button>
      {q ? (
        <Link
          prefetch={false}
          href={resetHref}
          className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400"
        >
          초기화
        </Link>
      ) : null}
    </form>
  );
}
