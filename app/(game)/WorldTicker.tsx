'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from './world-message';

const ROW = 24; // 한 줄 높이(px) = h-6
const SPEED = 600; // 한 칸 슬라이드 시간(ms)
const DELAY = 4000; // 줄 사이 체류(ms)

/**
 * 월드 소식 티커 — react-advanced-news-ticker 방식. 현재/다음 두 줄을 세로로 쌓은 트랙을 한 스텝마다
 * 한 줄 위로 슬라이드(현재가 위로 빠지고 다음이 올라옴) → 끝나면 인덱스 +1, 트랙은 무전환 원복(점프
 * 없음). 두 줄이 각자 칸을 점유해 겹침 없음. 인덱스 파생이라 재동기화 effect 불필요. 바 클릭 → /world.
 */
export function WorldTicker({ entries }: { entries: WorldEventEntry[] }) {
  const n = entries.length;
  const [start, setStart] = useState(0);
  const [anim, setAnim] = useState(false);

  useEffect(() => {
    if (n <= 1) return;
    let settle: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setAnim(true); // 트랙 한 칸 위로
      settle = setTimeout(() => {
        setStart((s) => (s + 1) % n);
        setAnim(false); // 무전환 원복 — 다음이 제자리(현재)로
      }, SPEED);
    }, DELAY + SPEED);
    return () => {
      clearInterval(id);
      clearTimeout(settle);
    };
  }, [n]);

  if (n === 0) return null;
  const cur = entries[start % n]!;
  const next = entries[(start + 1) % n]!;
  const text = 'block w-full truncate text-[11px] leading-tight text-zinc-700 dark:text-zinc-300';

  return (
    <Link prefetch={false}
      href="/world"
      aria-label="월드 소식 전체 보기"
      className="sticky top-0 z-20 block border-b border-zinc-200 bg-white/90 px-4 py-1 backdrop-blur active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/90 dark:active:bg-zinc-900"
    >
      <span className="block overflow-hidden" style={{ height: ROW }}>
        <span
          className="block"
          style={{
            transform: anim ? `translateY(-${ROW}px)` : 'translateY(0)',
            transition: anim ? `transform ${SPEED}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
          }}
        >
          <span className="flex items-center" style={{ height: ROW }}>
            <span className={text}>{worldEventMessage(cur, { link: false })}</span>
          </span>
          <span className="flex items-center" style={{ height: ROW }}>
            <span className={text}>{worldEventMessage(next, { link: false })}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
