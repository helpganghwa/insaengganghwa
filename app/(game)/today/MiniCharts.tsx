'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import type { DailyEnhancePoint, DatedRankPoint } from '@/lib/game/today/stats';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const dayKo = (d: string) => '일월화수목금토'[new Date(`${d}T12:00:00Z`).getUTCDay()];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function useChart(build: (chart: echarts.EChartsType) => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    build(chart);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const AXIS = {
  axisLine: { lineStyle: { color: 'rgba(120,113,108,0.3)' } },
  axisTick: { show: false },
  axisLabel: { color: '#78716c', fontSize: 9 },
} as const;
const TOOLTIP_BASE = {
  backgroundColor: 'rgba(24,24,27,0.92)',
  borderColor: 'rgba(245,158,11,0.4)',
  textStyle: { color: '#e4e4e7', fontSize: 11 },
} as const;

/** 일별 강화 스택바 — 성공/유지/하락(2026-07-16 전체 탭 재구성). */
export function EnhanceDailyChart({ points }: { points: DailyEnhancePoint[] }) {
  const ref = useChart((chart) => {
    const dates = points.map((p) => md(p.kstDay));
    chart.setOption({
      grid: { left: 28, right: 8, top: 26, bottom: 20 },
      legend: {
        top: 0, left: 'center', itemWidth: 10, itemHeight: 8, icon: 'roundRect',
        textStyle: { color: '#78716c', fontSize: 9 },
      },
      tooltip: {
        ...TOOLTIP_BASE,
        trigger: 'axis',
        formatter: (ps: unknown) => {
          const arr = ps as { seriesName: string; dataIndex: number; value: number; marker: string }[];
          if (!arr.length) return '';
          const p = points[arr[0]!.dataIndex]!;
          const total = p.success + p.hold + p.down;
          return `${md(p.kstDay)} (${dayKo(p.kstDay)}) · ${total}회<br/>` +
            arr.map((a) => `${a.marker} ${a.seriesName} <b>${a.value}</b>`).join('<br/>');
        },
      },
      xAxis: { type: 'category', data: dates, ...AXIS },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: 'rgba(120,113,108,0.12)' } }, axisLabel: AXIS.axisLabel },
      series: [
        { name: '성공', type: 'bar', stack: 'e', data: points.map((p) => p.success), itemStyle: { color: '#34d399' }, barMaxWidth: 10 },
        { name: '유지', type: 'bar', stack: 'e', data: points.map((p) => p.hold), itemStyle: { color: '#71717a' }, barMaxWidth: 10 },
        { name: '하락', type: 'bar', stack: 'e', data: points.map((p) => p.down), itemStyle: { color: '#f87171' }, barMaxWidth: 10 },
      ],
      animationDuration: 400,
    });
  }, [points]);
  return <div ref={ref} className="h-[150px] w-full" />;
}

/** 단일 랭킹 추이 라인(1위가 위) — 레이드/대난투 공용. */
export function SingleRankChart({ points, color, name }: { points: DatedRankPoint[]; color: string; name: string }) {
  const ref = useChart((chart) => {
    const dates = points.map((p) => md(p.kstDay));
    chart.setOption({
      grid: { left: 30, right: 10, top: 12, bottom: 20 },
      tooltip: {
        ...TOOLTIP_BASE,
        trigger: 'axis',
        formatter: (ps: unknown) => {
          const arr = ps as { dataIndex: number; value: number; marker: string }[];
          if (!arr.length) return '';
          const p = points[arr[0]!.dataIndex]!;
          return `${md(p.kstDay)} (${dayKo(p.kstDay)})<br/>${arr[0]!.marker} ${name} <b>#${p.rank}</b>`;
        },
      },
      xAxis: { type: 'category', data: dates, boundaryGap: false, ...AXIS },
      yAxis: {
        type: 'value', inverse: true, min: 1, minInterval: 1,
        axisLabel: { ...AXIS.axisLabel, formatter: '#{value}' },
        splitLine: { lineStyle: { color: 'rgba(120,113,108,0.12)' } },
      },
      series: [{
        type: 'line', data: points.map((p) => p.rank), smooth: 0.3, symbol: 'circle',
        symbolSize: 4, connectNulls: true, lineStyle: { color, width: 2 }, itemStyle: { color },
      }],
      animationDuration: 400,
    });
  }, [points]);
  return <div ref={ref} className="h-[130px] w-full" />;
}
