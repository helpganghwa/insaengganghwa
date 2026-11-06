'use client';

import { useState } from 'react';

import type { DailyEnhancePoint, DatedRankPoint } from '@/lib/game/today/stats';

import { LineRankSvg } from './LineRankSvg';
import { rankAxisRange } from './rank-axis';
import {
  Legend, Pointer, Tooltip, XAxis, YAxis, fitGrid, liftColor, marker, niceAxis, tickLabel, useHover, useIntroDone, useWidth,
} from './svg-chart';

/** 2026-11-06 업데이트 18: echarts → 손수 SVG. 옵션 값(격자·범례·색·툴팁 문구·막대 폭)은 종전 그대로. */
const dayKo = (d: string) => '일월화수목금토'[new Date(`${d}T12:00:00Z`).getUTCDay()];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const BARS = [
  { key: 'successH', cnt: 'success', name: '성공', color: '#34d399' },
  { key: 'holdH', cnt: 'hold', name: '유지', color: '#71717a' },
  { key: 'downH', cnt: 'down', name: '하락', color: '#f87171' },
] as const;

/** 일별 단련 시간 스택바 — 결과별 대기시간 합(h). 시도 횟수는 성장할수록 줄어 y축 부적합
 *  (고레벨=긴 대기=큰 막대 — 우상향 성장 서사, 2026-07-16 확정). 툴팁에 횟수 병기. */
export function EnhanceDailyChart({ points }: { points: DailyEnhancePoint[] }) {
  const height = 150;
  const [wRef, W] = useWidth<HTMLDivElement>();
  const [on, setOn] = useState([true, true, true]);
  const n = points.length;
  const stackMax = Math.max(0, ...points.map((p) => BARS.reduce((s, b, bi) => s + (on[bi] ? p[b.key] : 0), 0)));
  const axis = niceAxis(stackMax);
  const ticks: number[] = [];
  for (let t = axis.min; t <= axis.max + 1e-9; t += axis.interval) ticks.push(+t.toFixed(10));
  const yLabel = (v: number) => `${tickLabel(v, axis.interval)}시간`;
  const labels = points.map((p) => md(p.kstDay));
  const fit = fitGrid({ left: 28, right: 8, top: 26, bottom: 20 }, ticks.map(yLabel), labels, W, false);
  const grid = fit.grid;
  const interval = fit.interval;
  const x0 = grid.left;
  const x1 = W - grid.right;
  const y0 = grid.top;
  const y1 = height - grid.bottom;
  const band = n > 0 ? (x1 - x0) / n : 0;
  const xs = points.map((_, i) => x0 + band * (i + 0.5));
  const barW = Math.min(10, band * 0.8); // barCategoryGap 20% · barMaxWidth 10
  const yOf = (v: number) => y1 - ((v - axis.min) / (axis.max - axis.min)) * (y1 - y0);
  const introDone = useIntroDone(W > 0, 450);
  const { hover, boxRef, handlers } = useHover(grid, W, height, (x) => Math.min(n - 1, Math.max(0, Math.floor((x - x0) / band))));
  const tooltip = (i: number) => {
    const p = points[i]!;
    const totalH = Math.round((p.successH + p.holdH + p.downH) * 10) / 10;
    return (
      `${md(p.kstDay)} (${dayKo(p.kstDay)}) · ${totalH}시간 단련 · 시도 ${p.success + p.hold + p.down}회<br/>` +
      BARS.filter((_, bi) => on[bi]).map((b) => `${marker(b.color)} ${b.name} <b>${p[b.key]}시간</b> (${p[b.cnt] ?? 0}회)`).join('<br/>')
    );
  };
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
          <YAxis ticks={ticks} yOf={yOf} x0={x0} x1={x1} fmt={yLabel} />
          {points.map((p, i) => {
            let acc = 0;
            return (
              <g key={i}>
                {BARS.map((b, bi) => {
                  if (!on[bi]) return null;
                  const v = p[b.key];
                  const top = yOf(acc + v);
                  const bottom = yOf(acc);
                  acc += v;
                  if (v <= 0) return null;
                  return (
                    <rect
                      key={b.key}
                      className={introDone ? undefined : 'tdc-bar'}
                      x={xs[i]! - barW / 2}
                      y={top}
                      width={barW}
                      height={bottom - top}
                      fill={hover?.i === i ? liftColor(b.color) : b.color}
                    />
                  );
                })}
              </g>
            );
          })}
          {/* 가리킨 칸 점선은 막대 위(echarts axisPointer z가 시리즈보다 높다). */}
          {hover ? <Pointer x={xs[hover.i]!} y0={y0} y1={y1} /> : null}
          <XAxis labels={labels} xs={xs} y={y1} x0={x0} x1={x1} interval={interval} />
          <Legend
            items={BARS.map((b, i) => ({ name: b.name, color: b.color, on: on[i]! }))}
            width={W}
            itemW={10}
            itemH={8}
            fontSize={9}
            onToggle={(i) => setOn((o) => o.map((v, k) => (k === i ? !v : v)))}
          />
        </svg>
      ) : null}
      {hover && W > 0 && on.some(Boolean) ? <Tooltip html={tooltip(hover.i)} x={hover.x} y={hover.y} width={W} height={height} /> : null}
    </div>
  );
}

/** 단일 랭킹 추이 라인(1위가 위) — 레이드/대난투 공용. */
export function SingleRankChart({ points, color, name }: { points: DatedRankPoint[]; color: string; name: string }) {
  return (
    <LineRankSvg
      height={130}
      grid={{ left: 30, right: 10, top: 12, bottom: 20 }}
      labels={points.map((p) => md(p.kstDay))}
      series={[{ name, color, data: points.map((p) => p.rank) }]}
      // 범위·간격 직접 고정 — 이유는 rank-axis.ts 주석(1등 라벨 소실·0.5등 발생).
      range={rankAxisRange(points.map((p) => p.rank))}
      tooltip={(i) => {
        const p = points[i]!;
        return `${md(p.kstDay)} (${dayKo(p.kstDay)})<br/>${marker(color)} ${name} <b>#${p.rank}</b>`;
      }}
      animMs={400}
    />
  );
}
