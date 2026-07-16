'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 전 지표 한 줄, **무한 흐름 marquee**(2026-07-16 확정:
 * 교대 페이드 폐기). 동일 사본 2개를 이어붙여 translateX -50% 무한 루프(이음새 없음).
 * 지표(전투력/최고/합산)는 증감만·증감 있는 것만, 강화 통계는 항상. 전체 영역 탭 → /today.
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
            {i > 0 ? <span className="text-zinc-400 dark:text-zinc-600"> · </span> : null}
            {p}
          </span>
        ))}
      </>
    );
  }, [data]);

  // 사본 1개 폭 실측 → 속도 일정(px/s)하게 주기 계산. 폰트 로드 후 재측정.
  const copyRef = useRef<HTMLSpanElement>(null);
  const [durS, setDurS] = useState(14);
  useEffect(() => {
    const measure = () => {
      const w = copyRef.current?.scrollWidth ?? 0;
      if (w > 0) setDurS(Math.max(8, w / SCROLL_PX_PER_S));
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [line]);

  // 사본에 넉넉한 우측 간격(문장 끝↔다음 시작) — 폭에 포함되어 -50% 루프가 정확히 맞물림.
  const copy = (withRef: boolean) => (
    <span
      ref={withRef ? copyRef : undefined}
      aria-hidden={!withRef}
      className="inline-block whitespace-nowrap pr-10"
    >
      {line}
    </span>
  );

  return (
    <Link
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className="flex w-max items-center text-[11.5px] leading-none tabular-nums text-zinc-800 dark:text-zinc-100"
          style={{ animation: `today-ticker-flow ${durS}s linear infinite` }}
        >
          {copy(true)}
          {copy(false)}
        </div>
      </div>
    </Link>
  );
}
