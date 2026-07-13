'use client';

import { useState } from 'react';

/**
 * 내 코드(#publicCode) 표시 + 복사 — 설정·계정 섹션(2026-07-13 요청).
 * 친구 검색·문의 식별에 쓰는 코드를 유저가 직접 조회/공유할 수 있게.
 */
export function CodeRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 미지원(구형 웹뷰) — 코드가 화면에 보이므로 수동 복사 가능 */
    }
  };

  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
        #{code}
      </span>
      <button
        type="button"
        onClick={copy}
        className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
          copied
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-zinc-100 text-zinc-600 active:scale-95 dark:bg-zinc-800 dark:text-zinc-300'
        }`}
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </span>
  );
}
