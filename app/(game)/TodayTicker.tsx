'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 전 지표 한 줄 **무한 흐름 marquee**(2026-07-16).
 * 사본을 컨테이너를 채우고도 남게 반복 배치(주식 티커처럼 촘촘히)하고, 정확히 사본
 * 1개 폭(--tt-shift)만큼 이동하는 무한 루프 — 내용이 짧아도 공백·점프 없음.
 * 지표(전투력/최고/합산)는 증감 있는 것만, 강화 통계는 상시. 전체 영역 탭 → /today.
 */
const SCROLL_PX_PER_S = 30;

/** 만/억 축약 — 1억 이상 X.X억, 1만 이상 X.X만(소수 1자리), 그 외 로케일 숫자. */
const fmtKo = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(abs % 10_000 === 0 ? 0 : 1)}만`;
  return n.toLocaleString('ko-KR');
};

function Delta({ d }: { d: number }) {
  return d > 0 ? (
    <span className="text-emerald-600 dark:text-emerald-400">{fmtKo(d)} 상승</span>
  ) : (
    <span className="text-red-500 dark:text-red-400">{fmtKo(-d)} 하락</span>
  );
}

export function TodayTicker({ data }: { data: TickerData }) {
  const line = useMemo(() => {
    const parts: React.ReactNode[] = [];
    if (data.combatDelta) parts.push(<>전투력 <Delta d={data.combatDelta} /></>);
    if (data.maxDelta) parts.push(<>최고 강화 <Delta d={data.maxDelta} /></>);
    if (data.sumDelta) parts.push(<>합산 강화 <Delta d={data.sumDelta} /></>);
    parts.push(<>강화 {data.attempts}회</>);
    parts.push(<span className="text-emerald-600 dark:text-emerald-400">성공 {data.success}</span>);
    parts.push(<span className="text-zinc-500 dark:text-zinc-400">유지 {data.hold}</span>);
    parts.push(
      <span className={data.down > 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}>
        하락 {data.down}
      </span>,
    );
    return (
      <>
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            <span className="text-zinc-400 dark:text-zinc-600"> · </span>
          </span>
        ))}
      </>
    );
  }, [data]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [copyW, setCopyW] = useState(0);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const measure = () => {
      const w = copyRef.current?.scrollWidth ?? 0;
      const c = wrapRef.current?.clientWidth ?? 0;
      if (w > 0 && c > 0) {
        setCopyW(w);
        // 컨테이너 + 사본 1개를 항상 덮도록 — 이동 중에도 빈 공간이 생기지 않는 최소 반복 수.
        setCopies(Math.max(2, Math.ceil(c / w) + 1));
      }
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [line]);

  const durS = copyW > 0 ? Math.max(6, copyW / SCROLL_PX_PER_S) : 14;

  return (
    <Link
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <div ref={wrapRef} className="min-w-0 flex-1 overflow-hidden">
        <div
          className="flex w-max items-center text-[11.5px] leading-none tabular-nums text-zinc-800 dark:text-zinc-100"
          style={
            copyW > 0
              ? {
                  animation: `today-ticker-flow ${durS}s linear infinite`,
                  ['--tt-shift' as string]: `-${copyW}px`,
                }
              : undefined
          }
        >
          {Array.from({ length: copies }, (_, i) => (
            <span key={i} ref={i === 0 ? copyRef : undefined} aria-hidden={i > 0} className="inline-block whitespace-nowrap">
              {line}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
