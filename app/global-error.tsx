'use client';

import { useEffect } from 'react';

import { reportBoundaryError } from '@/lib/report-boundary-error';

/**
 * 루트 에러 바운더리 — root layout 자체가 렌더 실패할 때의 최후 폴백(2026-05-29).
 * global-error는 html/body를 직접 포함해야 한다(layout을 대체하므로).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBoundaryError('global-boundary', error), [error]);
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-50">
        <p className="text-sm text-zinc-300">
          문제가 발생했어요.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 active:scale-95"
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
