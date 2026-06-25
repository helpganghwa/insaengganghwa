'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from './world-message';

/**
 * 월드 소식 티커 — 헤더 하단 고정(sticky). 최근 N건을 한 줄씩 세로 롤링(3.5초). 바 전체 클릭 →
 * /world(전체 100건). 헤더가 sticky top-0 z-30 h-12(+safe-area)라 그 바로 아래에 z-20로 고정.
 */
export function WorldTicker({ entries }: { entries: WorldEventEntry[] }) {
  const [i, setI] = useState(0);
  const n = entries.length;

  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => setI((p) => (p + 1) % n), 3500);
    return () => clearInterval(id);
  }, [n]);

  if (n === 0) return null;
  const e = entries[i % n]!;

  return (
    <Link
      href="/world"
      aria-label="월드 소식 전체 보기"
      className="sticky z-20 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/90 dark:active:bg-zinc-900"
      style={{ top: 'calc(env(safe-area-inset-top) + 3rem)' }}
    >
      <span aria-hidden className="shrink-0 text-[11px] leading-none">
        📢
      </span>
      {/* key=이벤트 id → 회전 시 재마운트되며 등장 애니메이션 재생 */}
      <span
        key={e.id}
        className="animate-ticker-in min-w-0 flex-1 truncate text-[11px] leading-tight text-zinc-700 dark:text-zinc-300"
      >
        {worldEventMessage(e, { link: false })}
      </span>
      <span aria-hidden className="shrink-0 text-[11px] leading-none text-zinc-300 dark:text-zinc-600">
        ›
      </span>
    </Link>
  );
}
