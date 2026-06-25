'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from './world-message';

/**
 * 월드 소식 티커 — 헤더 하단 고정(sticky top-0, 스크롤 컨테이너=main). 최근 N건을 한 줄씩 세로
 * 롤링: 이전 줄은 위로 빠지고 다음 줄이 아래에서 올라옴(5초). 바 전체 클릭 → /world.
 *
 * cur/prev 두 슬롯을 같은 자리에 절대배치 — cur=roll-in(아래→제자리), prev=roll-out(제자리→위).
 * key로 재마운트해 매 전환마다 애니메이션 재생.
 */
export function WorldTicker({ entries }: { entries: WorldEventEntry[] }) {
  const n = entries.length;
  const [state, setState] = useState({ cur: 0, prev: -1 });

  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => {
      setState((s) => ({ cur: (s.cur + 1) % n, prev: s.cur }));
    }, 5000);
    return () => clearInterval(id);
  }, [n]);

  if (n === 0) return null;
  const cur = entries[state.cur % n]!;
  const prev = state.prev >= 0 && state.prev !== state.cur ? entries[state.prev % n] : null;
  const line = 'absolute inset-x-0 top-0 block truncate text-[11px] leading-5 text-zinc-700 dark:text-zinc-300';

  return (
    <Link
      href="/world"
      aria-label="월드 소식 전체 보기"
      className="sticky top-0 z-20 block border-b border-zinc-200 bg-white/90 px-4 py-2.5 backdrop-blur active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/90 dark:active:bg-zinc-900"
    >
      <span className="relative block h-5 overflow-hidden">
        <span key={state.cur} className={`animate-roll-in ${line}`}>
          {worldEventMessage(cur, { link: false })}
        </span>
        {prev && (
          <span key={`p-${state.prev}-${state.cur}`} className={`animate-roll-out ${line}`}>
            {worldEventMessage(prev, { link: false })}
          </span>
        )}
      </span>
    </Link>
  );
}
