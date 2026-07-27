'use client';

import { useEffect } from 'react';

import { reportBoundaryError } from '@/lib/report-boundary-error';
import { tryReloadOnChunkError } from '@/lib/chunk-reload';

/**
 * 루트 세그먼트 에러 바운더리 — (game) 밖 공개 라우트(로그인·/u·/go·/legal·/pricing·/faq·
 * /probability 등)가 렌더 실패 시 global-error의 최소 폴백 대신 안내 UI 노출(2026-07-27).
 * (game)은 자체 error.tsx가 우선 처리. 청크 로드 실패는 리포트 후 자동 전체 리로드로 회복.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportBoundaryError('boundary', error);
    tryReloadOnChunkError(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        일시적인 오류가 발생했어요.
        <br />
        잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
      >
        다시 시도
      </button>
    </div>
  );
}
