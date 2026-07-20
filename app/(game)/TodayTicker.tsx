'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 전 지표 한 줄 무한 흐름, **rAF 직접 구동**(2026-07-16 확정):
 * CSS 반복 애니메이션은 iOS에서 반복 경계마다 레이어 재래스터(깜빡임) — rAF는 연속 위치
 * 계산 + 모듈로 랩이라 경계 자체가 없음. 최적화:
 *  - 프레임당 setState 0(ref로 transform 직접 갱신, React 리렌더 없음)
 *  - 문서 숨김·뷰포트 밖(IntersectionObserver)에서 정지, prefers-reduced-motion이면 정적
 * 속도 20px/s(저자극, 사용자 확정). 지표는 증감 있는 것만 + 강화 통계 상시. 탭 → /today.
 */
const SCROLL_PX_PER_S = 20;

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
    parts.push(<>강화 {data.attempts}회 시도</>);
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
            {/* NBSP 구분 — 일반 공백은 사본 종단(인라인 박스 끝)에서 잘림. */}
            <span className="text-zinc-400 dark:text-zinc-600">{' · '}</span>
          </span>
        ))}
      </>
    );
  }, [data]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const halfWRef = useRef(0); // 절반(사본 그룹) 폭 — rAF 랩 기준. state 아님(리렌더 방지).
  const [perHalf, setPerHalf] = useState(1);

  // 측정 — 사본 수(절반이 컨테이너를 덮도록)와 절반 폭. 폰트 로드·리사이즈 재측정.
  useEffect(() => {
    const measure = () => {
      const w = copyRef.current?.getBoundingClientRect().width ?? 0;
      const c = wrapRef.current?.clientWidth ?? 0;
      if (w > 0 && c > 0) {
        const m = Math.max(1, Math.ceil(c / w));
        setPerHalf(m);
        halfWRef.current = w * m;
      }
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [line]);

  // rAF 루프 — 연속 위치(x)로 transform 직접 갱신. 경계 없음(모듈로 랩).
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; // 정적 유지
    let raf = 0;
    let last: number | null = null;
    let x = 0;
    let active = true;
    let inView = true;

    const step = (t: number) => {
      if (!active || !inView) return; // 정지 상태 — visibility/observer가 재개
      if (last != null) {
        x -= (SCROLL_PX_PER_S * (t - last)) / 1000;
        const hw = halfWRef.current;
        if (hw > 0 && x <= -hw) x += hw; // 이음새 없는 랩 — 절반 폭만큼 복귀
        if (trackRef.current) trackRef.current.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      last = null; // dt 리셋 — 재개 시 점프 방지
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    };
    const onVisibility = () => {
      active = !document.hidden;
      if (active && inView) start();
    };
    const io = new IntersectionObserver(([e]) => {
      inView = e?.isIntersecting ?? true;
      if (active && inView) start();
    });
    if (wrapRef.current) io.observe(wrapRef.current);
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      io.disconnect();
    };
  }, []);

  const half = (withRef: boolean) => (
    <span aria-hidden={!withRef} className="flex w-max items-center">
      {Array.from({ length: perHalf }, (_, i) => (
        <span key={i} ref={withRef && i === 0 ? copyRef : undefined} className="inline-block whitespace-nowrap">
          {line}
        </span>
      ))}
    </span>
  );

  return (
    <Link prefetch={false}
      href="/today"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-2"
    >
      <span className="shrink-0 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
        오늘의 인생강화
      </span>
      <div ref={wrapRef} className="min-w-0 flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex w-max items-center text-[11.5px] leading-none tabular-nums text-zinc-700 dark:text-zinc-200"
          style={{ willChange: 'transform' }}
        >
          {half(true)}
          {half(false)}
        </div>
      </div>
    </Link>
  );
}
