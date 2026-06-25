'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { WorldEventEntry } from '@/lib/game/world/event';
import { worldEventMessage } from './world-message';

const ROLL_MS = 700;

/**
 * 월드 소식 티커 — 헤더 하단 고정(sticky top-0, 스크롤 컨테이너=main). 최근 N건을 한 줄씩 세로
 * 롤링: 현재/다음 두 줄을 세로로 쌓은 트랙을 통째로 한 칸 위로 밀어, 현재는 위로 빠지고 다음이
 * 아래에서 올라옴(5초 체류, 0.6s 전환). 두 줄이 각자 칸을 점유하므로 글씨 겹침 없음. 바 클릭 → /world.
 */
export function WorldTicker({ entries }: { entries: WorldEventEntry[] }) {
  const n = entries.length;
  const [cur, setCur] = useState(0);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (n <= 1) return;
    let settle: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setRolling(true); // 트랙을 한 칸 위로(전환 시작)
      settle = setTimeout(() => {
        // 전환 끝 → 다음을 현재로 올리고 트랙 즉시 원위치(무전환) — 화면상 동일 위치라 점프 없음.
        setCur((c) => (c + 1) % n);
        setRolling(false);
      }, ROLL_MS);
    }, 5000);
    return () => {
      clearInterval(id);
      clearTimeout(settle);
    };
  }, [n]);

  if (n === 0) return null;
  const next = entries[(cur + 1) % n]!;
  const slot = 'flex h-6 items-center';
  const text = 'block w-full truncate text-[11px] leading-tight text-zinc-700 dark:text-zinc-300';

  return (
    <Link
      href="/world"
      aria-label="월드 소식 전체 보기"
      className="sticky top-0 z-20 block border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/90 dark:active:bg-zinc-900"
    >
      <span className="relative block h-6 overflow-hidden">
        <span
          className="block"
          style={{
            transform: rolling ? 'translateY(-100%)' : 'translateY(0)',
            // 부드럽게 — 오버슈트 없는 표준 이징(두 줄이 같은 속도로 함께 위로). 복귀는 무전환(점프 방지).
            transition: rolling ? `transform ${ROLL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
          }}
        >
          <span className={slot}>
            <span className={text}>{worldEventMessage(entries[cur % n]!, { link: false })}</span>
          </span>
          <span className={slot}>
            <span className={text}>{worldEventMessage(next, { link: false })}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
