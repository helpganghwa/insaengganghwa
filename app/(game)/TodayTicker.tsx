'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' 티커 — 전 지표 한 줄 무한 흐름.
 *
 * 구동: **CSS 키프레임 translate3d 0 → -50%**(2026-11-06 업데이트 18). 종전 rAF 루프는 홈이 보이는 동안 메인 스레드를
 * 초당 60번 깨워 저사양 기기의 idle·배터리를 잡아먹었다. 이제 합성기가 돌리고 JS는 폭을 잴 때만 일한다.
 *  - 트랙 = 같은 절반 2개(각 절반 = 사본 M개, 컨테이너를 덮는 수). -50% = 정확히 절반 1개라 반복 이음새가 없다.
 *  - 속도 20px/s(저자극, 사용자 확정) — 절반 폭(px) ÷ 20 = 한 바퀴 시간. 폰트 로드·리사이즈 때 다시 잰다.
 *  - 뷰포트 밖(IntersectionObserver)은 data-paused로, 팝업 뒤 흐림은 globals.css 규칙으로 멈춘다(숨긴 탭은 브라우저가 멈춤).
 *  - prefers-reduced-motion이면 정적.
 *  - 2026-07-16에 iOS에서 반복 경계마다 깜빡임이 있어 rAF로 바꿨던 이력이 있다. 그때 키프레임은 translateX(2D)라
 *    레이어가 경계마다 다시 그려졌다 — 지금은 translate3d + will-change + backface-visibility로 레이어를 고정한다.
 * 지표는 증감 있는 것만 + 강화 통계 상시. 탭 → /today.
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
  const [perHalf, setPerHalf] = useState(1);
  /** 한 바퀴(절반 1개 이동) 시간(초) — 재기 전(SSR·첫 렌더)은 null = 정지(종전에도 마운트 뒤에 흘렀다). */
  const [durS, setDurS] = useState<number | null>(null);

  // 측정 — 사본 수(절반이 컨테이너를 덮도록)와 절반 폭 → 한 바퀴 시간. 폰트 로드·리사이즈 재측정.
  useEffect(() => {
    const measure = () => {
      const w = copyRef.current?.getBoundingClientRect().width ?? 0;
      const c = wrapRef.current?.clientWidth ?? 0;
      if (w > 0 && c > 0) {
        const m = Math.max(1, Math.ceil(c / w));
        setPerHalf(m);
        setDurS((w * m) / SCROLL_PX_PER_S);
      }
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [line]);

  // 뷰포트 밖이면 멈춘다 — 리렌더 없이 속성만 바꾼다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const io = new IntersectionObserver(([e]) => {
      const t = trackRef.current;
      if (!t) return;
      if (e?.isIntersecting ?? true) t.removeAttribute('data-paused');
      else t.setAttribute('data-paused', '');
    });
    io.observe(wrap);
    return () => io.disconnect();
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
          className={`today-ticker-track flex w-max items-center text-[11.5px] leading-none tabular-nums text-zinc-700 dark:text-zinc-200${
            durS != null ? ' today-ticker-run' : ''
          }`}
          style={durS != null ? { animationDuration: `${durS.toFixed(3)}s` } : undefined}
        >
          {half(true)}
          {half(false)}
        </div>
      </div>
    </Link>
  );
}
