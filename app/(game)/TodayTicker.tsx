'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 문구 교대 페이드 + 넘치면 **왕복 marquee 루프**
 * (정지→좌로→정지→복귀 무한, 2026-07-16: forwards 단방향은 '잘린 채 정지'로 보여 폐기).
 * 지표 문구는 증감만 표시(현재 수치 제외, 사용자 확정). 전체 영역 탭 → /today.
 */
const SCROLL_PX_PER_S = 35;
const ROTATE_MS = 10_000;

/** 만/억 축약 — 1억 이상 X.X억, 1만 이상 X.X만(소수 1자리), 그 외 로케일 숫자. */
const fmtKo = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(abs % 10_000 === 0 ? 0 : 1)}만`;
  return n.toLocaleString('ko-KR');
};

function Delta({ d }: { d: number }) {
  return d > 0 ? (
    <span className="text-emerald-600 dark:text-emerald-400">▲{fmtKo(d)}</span>
  ) : (
    <span className="text-red-500 dark:text-red-400">▼{fmtKo(-d)}</span>
  );
}

export function TodayTicker({ data }: { data: TickerData }) {
  const msgs = useMemo(() => {
    const out: React.ReactNode[] = [];
    // 지표 — 증감이 있는 것만, 증감치만(현재 수치 생략).
    const deltas: React.ReactNode[] = [];
    if (data.combatDelta) deltas.push(<>전투력 <Delta d={data.combatDelta} /></>);
    if (data.maxDelta) deltas.push(<>최고 강화 <Delta d={data.maxDelta} /></>);
    if (data.sumDelta) deltas.push(<>합산 강화 <Delta d={data.sumDelta} /></>);
    if (deltas.length > 0)
      out.push(
        <>
          {deltas.map((d, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : ''}
              {d}
            </span>
          ))}
        </>,
      );
    out.push(
      <>
        강화 {data.attempts}회 · 성공{' '}
        <span className="text-emerald-600 dark:text-emerald-400">{data.success}</span> · 유지 {data.hold} · 하락{' '}
        <span className={data.down > 0 ? 'text-red-500 dark:text-red-400' : ''}>{data.down}</span>
      </>,
    );
    return out;
  }, [data]);

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [overflowPx, setOverflowPx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // 문구 교체마다 넘침 측정(폰트 로드·리사이즈 재측정 포함).
  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const text = textRef.current;
      if (!wrap || !text) return;
      setOverflowPx(Math.max(0, text.scrollWidth - wrap.clientWidth));
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [idx, msgs]);

  // 교대 — 문구가 2개 이상일 때만.
  useEffect(() => {
    if (msgs.length <= 1) return;
    const t = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % msgs.length);
        setVisible(true);
      }, 250);
    }, ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [idx, msgs.length]);

  // 왕복 루프 주기 — 이동 구간(32%×2)이 스크롤 속도에 맞도록 역산, 최소 5초.
  const loopDurS = Math.max(5, (overflowPx / SCROLL_PX_PER_S) * 2 / 0.64);

  return (
    <Link
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <div className={`min-w-0 flex-1 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {/* 정렬 — 평소 우측, 넘칠 땐 좌측(우측 정렬이면 왼쪽이 잘린 채 시작). */}
        <div
          ref={wrapRef}
          className={`flex items-center overflow-hidden ${overflowPx > 0 ? 'justify-start' : 'justify-end'}`}
        >
          <span
            key={idx}
            ref={textRef}
            className="inline-block whitespace-nowrap text-[11.5px] leading-none tabular-nums text-zinc-800 dark:text-zinc-100"
            style={
              overflowPx > 0
                ? {
                    animation: `today-ticker-slide ${loopDurS}s linear 0.4s infinite`,
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
