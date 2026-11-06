'use client';

import { useId, useState } from 'react';

import { Legend, Pointer, Tooltip, XAxis, YAxis, fitGrid, liftColor, smoothPath, useHover, useIntroDone, useWidth, type Grid } from './svg-chart';

/**
 * 순위 추이 선 그래프(1위가 위) — 손수 SVG(2026-11-06 업데이트 18, echarts 대체). 종전 옵션: smooth 0.3, 원 점 4px,
 * 선 2px, connectNulls, boundaryGap false, 축 범위는 호출부가 rankAxisRange로 고정. 범례가 있으면 눌러 시리즈를 끄고 켠다.
 */
export type RankSeries = { name: string; color: string; data: (number | null)[] };

export function LineRankSvg({
  height, grid: grid0, labels, series, range, legend, tooltip, animMs,
}: {
  height: number;
  grid: Grid;
  labels: string[];
  series: RankSeries[];
  range: { min: number; max: number; interval: number };
  legend?: { itemW: number; itemH: number; fontSize: number };
  /** 툴팁 HTML — (칸 번호, 보이는 시리즈 번호들). */
  tooltip: (i: number, visible: number[]) => string;
  animMs: number;
}) {
  const [wRef, W] = useWidth<HTMLDivElement>();
  const [on, setOn] = useState(() => series.map(() => true));
  const clipId = `rk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const n = labels.length;
  const ticks: number[] = [];
  for (let t = range.min; t <= range.max + 1e-9; t += range.interval) ticks.push(t);
  const fit = fitGrid(grid0, ticks.map((t) => `#${t}`), labels, W, true);
  const grid = fit.grid;
  const interval = fit.interval;
  const x0 = grid.left;
  const x1 = W - grid.right;
  const y0 = grid.top;
  const y1 = height - grid.bottom;
  const xs = labels.map((_, i) => (n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : (x0 + x1) / 2));
  const yOf = (v: number) => y0 + ((v - range.min) / (range.max - range.min)) * (y1 - y0);
  const unit = n > 1 ? (x1 - x0) / (n - 1) : x1 - x0;
  const { hover, boxRef, handlers } = useHover(grid, W, height, (x) => (n > 1 ? Math.round((x - x0) / unit) : 0));
  const visible = series.map((_, i) => i).filter((i) => on[i]);
  const introDone = useIntroDone(W > 0, animMs + 350); // 선 드러남 + 마지막 점 커짐
  return (
    <div
      ref={(el) => {
        wRef.current = el;
        boxRef.current = el;
      }}
      className="relative w-full"
      style={{ height, touchAction: 'pan-y' }}
      {...handlers}
    >
      {W > 0 ? (
        <svg width={W} height={height} style={{ display: 'block', overflow: 'visible' }}>
          {introDone ? null : (
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} height={height} width={0}>
                  <animate attributeName="width" from="0" to={W} dur={`${animMs}ms`} fill="freeze" />
                </rect>
              </clipPath>
            </defs>
          )}
          <YAxis ticks={ticks} yOf={yOf} x0={x0} x1={x1} fmt={(v) => `#${v}`} />
          <XAxis labels={labels} xs={xs} y={y1} x0={x0} x1={x1} interval={interval} />
          {series.map((s, si) =>
            on[si] ? (
              <g key={s.name}>
                <path
                  d={smoothPath(s.data.map((v, i) => (v == null ? null : [xs[i]!, yOf(v)])), 0.3)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="bevel"
                  clipPath={introDone ? undefined : `url(#${clipId})`}
                />
                {s.data.map((v, i) =>
                  v == null ? null : (
                    <circle
                      key={i}
                      className={introDone ? undefined : 'tdc-sym'}
                      cx={xs[i]}
                      cy={yOf(v)}
                      r={hover?.i === i ? 3 : 2}
                      fill={hover?.i === i ? liftColor(s.color) : s.color}
                      style={{ animationDelay: `${Math.round(((xs[i]! - x0) / Math.max(1, x1 - x0)) * animMs)}ms` }}
                    />
                  ),
                )}
              </g>
            ) : null,
          )}
          {/* 가리킨 칸 점선은 선·점 위(echarts axisPointer z가 시리즈보다 높다). */}
          {hover ? <Pointer x={xs[hover.i]!} y0={y0} y1={y1} /> : null}
          {legend ? (
            <Legend
              items={series.map((s, i) => ({ name: s.name, color: s.color, on: on[i]! }))}
              width={W}
              itemW={legend.itemW}
              itemH={legend.itemH}
              fontSize={legend.fontSize}
              onToggle={(i) => setOn((o) => o.map((v, k) => (k === i ? !v : v)))}
            />
          ) : null}
        </svg>
      ) : null}
      {hover && W > 0 && visible.length > 0 ? <Tooltip html={tooltip(hover.i, visible)} x={hover.x} y={hover.y} width={W} height={height} /> : null}
    </div>
  );
}
