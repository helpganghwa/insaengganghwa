'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 1줄 고정, 문구 4초 페이드 롤링(2026-07-16 확정 시안).
 * 증감 있는 지표 우선 노출(전부 0이면 강화 통계 폴백), 전체 영역 탭 → /today.
 */
export function TodayTicker({ data }: { data: TickerData }) {
  const msgs = useMemo(() => {
    const out: React.ReactNode[] = [];
    const fmt = (n: number) => n.toLocaleString('ko-KR');
    const delta = (d: number | null) =>
      d == null || d === 0 ? null : d > 0 ? (
        <span className="font-extrabold text-emerald-400"> ▲ {fmt(d)}</span>
      ) : (
        <span className="font-extrabold text-red-400"> ▼ {fmt(-d)}</span>
      );
    if (data.combatDelta) out.push(<>전투력 <b>{fmt(data.combat)}</b>{delta(data.combatDelta)}</>);
    if (data.maxDelta) out.push(<>최고 강화 <b>+{fmt(data.maxEnhance)}</b>{delta(data.maxDelta)}</>);
    if (data.sumDelta) out.push(<>합산 강화 <b>+{fmt(data.sumEnhance)}</b>{delta(data.sumDelta)}</>);
    if (data.attempts > 0)
      out.push(
        <>
          강화 <b>{data.attempts}회</b> · 성공 <b className="text-emerald-400">{data.success}</b>{' '}
          유지 {data.hold}{data.down > 0 ? <span className="text-red-400"> 하락 {data.down}</span> : null}
        </>,
      );
    // 오늘 아무 변화도 없는 날 — 현재값 로테이션(카드가 죽어 보이지 않게).
    if (out.length === 0) {
      out.push(<>전투력 <b>{fmt(data.combat)}</b></>);
      if (data.maxEnhance > 0) out.push(<>최고 강화 <b>+{fmt(data.maxEnhance)}</b></>);
    }
    return out;
  }, [data]);

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (msgs.length <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % msgs.length);
        setVisible(true);
      }, 250);
    }, 10000);
    return () => clearInterval(t);
  }, [msgs.length]);

  return (
    <Link
      href="/today"
      className="relative flex items-center gap-2 overflow-hidden rounded-lg px-3.5 py-2 text-zinc-100"
    >
      {/* 픽셀 프레임 배너(Pixellab) — img 절대 채움(background-size 스트레치가 우측 잘림 유발, 2026-07-16). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sprites/today-ticker.png"
        alt=""
        aria-hidden
        className="absolute inset-0 -z-10 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <span className="shrink-0 text-[11px] font-extrabold text-amber-400">오늘의 인생강화</span>
      <span
        className="min-w-0 flex-1 truncate text-[12px] transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {msgs[idx]}
      </span>
    </Link>
  );
}
