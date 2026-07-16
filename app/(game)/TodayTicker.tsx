'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 1줄 고정, 두 문구(지표/강화 통계)를 10초 교대 페이드
 * (2026-07-16 확정: 2줄 동시 노출 → 교대 롤링 복귀). 전체 영역 탭 → /today.
 */
const fmt = (n: number) => n.toLocaleString('ko-KR');

function Delta({ d }: { d: number | null }) {
  if (!d) return null;
  return d > 0 ? (
    <span className="font-extrabold text-emerald-600 dark:text-emerald-400"> ▲{fmt(d)}</span>
  ) : (
    <span className="font-extrabold text-red-500 dark:text-red-400"> ▼{fmt(-d)}</span>
  );
}

export function TodayTicker({ data }: { data: TickerData }) {
  const msgs = useMemo(
    () => [
      <>
        전투력 <b>{fmt(data.combat)}</b>
        <Delta d={data.combatDelta} /> · 최고 <b>+{fmt(data.maxEnhance)}</b>
        <Delta d={data.maxDelta} /> · 합산 <b>+{fmt(data.sumEnhance)}</b>
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
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % 2);
        setVisible(true);
      }, 250);
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <Link
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <span
        className="min-w-0 flex-1 truncate text-right text-[11.5px] font-medium tabular-nums text-zinc-800 transition-opacity duration-200 dark:text-zinc-100"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {msgs[idx]}
      </span>
    </Link>
  );
}
