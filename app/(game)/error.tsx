'use client';

import { useEffect } from 'react';

import { reportBoundaryError } from '@/lib/report-boundary-error';
import { tryReloadOnChunkError } from '@/lib/chunk-reload';

/**
 * (game) 에러 바운더리 — 콜드 hang 가드가 끊고 throw하거나 예기치 못한 렌더 오류 시
 * 흰 화면 대신 "다시 시도" UI 노출(2026-05-29). reset()으로 세그먼트 재렌더.
 * 서버 컴포넌트/서버 액션 에러는 Vercel 로그에만 남던 사각 — client-error로 집계 리포트.
 * 청크 로드 실패(배포 스큐/전환 창 캐시)는 리포트 후 자동 전체 리로드로 회복.
 */
export default function GameError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportBoundaryError('boundary', error);
    tryReloadOnChunkError(error);
  }, [error]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
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
