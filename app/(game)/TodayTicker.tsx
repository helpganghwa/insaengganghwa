'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 두 문구(지표/강화 통계) 교대 페이드 + **넘치면 우→좌 marquee**
 * (GuideTicker와 동일 문법, 2026-07-16). 큰 수치는 만/억 축약(fmtKo). 전체 탭 → /today.
 */
const SCROLL_PX_PER_S = 35;
const SCROLL_DELAY_MS = 1500;
const BASE_MS = 10_000;

/** 만/억 축약 — 1억 이상 X.X억, 1만 이상 X.X만(소수 1자리), 그 외 로케일 숫자. */
const fmtKo = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(abs % 10_000 === 0 ? 0 : 1)}만`;
  return n.toLocaleString('ko-KR');
};

function Delta({ d }: { d: number | null }) {
  if (!d) return null;
  return d > 0 ? (
    <span className="font-extrabold text-emerald-600 dark:text-emerald-400"> ▲{fmtKo(d)}</span>
  ) : (
    <span className="font-extrabold text-red-500 dark:text-red-400"> ▼{fmtKo(-d)}</span>
  );
}

export function TodayTicker({ data }: { data: TickerData }) {
  const msgs = useMemo(
    () => [
      <>
        전투력 <b>{fmtKo(data.combat)}</b>
        <Delta d={data.combatDelta} /> · 최고 <b>+{fmtKo(data.maxEnhance)}</b>
        <Delta d={data.maxDelta} /> · 합산 <b>+{fmtKo(data.sumEnhance)}</b>
        <Delta d={data.sumDelta} />
      </>,
      <>
        강화 <b>{data.attempts}회</b> · 성공{' '}
        <b className="text-emerald-600 dark:text-emerald-400">{data.success}</b> · 유지 {data.hold} · 하락{' '}
        <span className={data.down > 0 ? 'font-bold text-red-500 dark:text-red-400' : ''}>{data.down}</span>
      </>,
    ],
    [data],
  );
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [overflowPx, setOverflowPx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // 문구 교체마다 넘침 측정 — 넘치면 marquee, 아니면 정지.
  useEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;
    setOverflowPx(Math.max(0, text.scrollWidth - wrap.clientWidth));
  }, [idx, msgs]);

  // 교대 — 체류 시간은 marquee 길이에 비례(다 읽고 교체).
  useEffect(() => {
    const scrollMs = overflowPx > 0 ? SCROLL_DELAY_MS + (overflowPx / SCROLL_PX_PER_S) * 1000 + 2000 : 0;
    const stayMs = Math.max(BASE_MS, scrollMs);
    const t = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % 2);
        setVisible(true);
      }, 250);
    }, stayMs);
    return () => window.clearTimeout(t);
  }, [idx, overflowPx]);

  const scrollDurS = overflowPx / SCROLL_PX_PER_S;

  return (
    <Link
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <div
        className={`min-w-0 flex-1 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* 정렬 — 평소 우측, 넘칠 땐 좌측(우측 정렬이면 왼쪽이 잘린 채 시작해 marquee 방향이 어긋남). */}
        <div ref={wrapRef} className={`flex items-center overflow-hidden ${overflowPx > 0 ? 'justify-start' : 'justify-end'}`}>
          <span
            key={idx}
            ref={textRef}
            className="inline-block whitespace-nowrap text-[11.5px] font-medium leading-none tabular-nums text-zinc-800 dark:text-zinc-100"
            style={
              overflowPx > 0
                ? {
                    animation: `guide-ticker-slide ${scrollDurS}s linear ${SCROLL_DELAY_MS}ms forwards`,
                    ['--gt-shift' as string]: `-${overflowPx}px`,
                  }
                : undefined
            }
          >
            {msgs[idx]}
          </span>
        </div>
      </div>
    </Link>
  );
}
