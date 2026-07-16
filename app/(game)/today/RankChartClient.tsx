'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import type { RankPoint } from '@/lib/game/today/stats';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

/**
 * 랭킹 추이 차트(2026-07-16) — 전투력/최고/합산 3지표 멀티라인, 범례 탭으로 토글.
 * 1위가 위(inverse y), 툴팁은 보이는 시리즈 일괄 표시.
 */
const SERIES = [
  { key: 'combat', name: '전투력', color: '#f59e0b' },
  { key: 'max', name: '최고', color: '#38bdf8' },
  { key: 'sum', name: '합산', color: '#34d399' },
] as const;

export function RankChartClient({ points }: { points: RankPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const dates = points.map((p) => `${Number(p.kstDay.slice(5, 7))}/${Number(p.kstDay.slice(8, 10))}`);
    const datesFull = points.map(
      (p) => `${Number(p.kstDay.slice(5, 7))}/${Number(p.kstDay.slice(8, 10))} (${'일월화수목금토'[new Date(`${p.kstDay}T12:00:00Z`).getUTCDay()]})`,
    );
    chart.setOption({
      grid: { left: 34, right: 12, top: 34, bottom: 22 },
      legend: {
        top: 0,
        left: 'center',
        itemWidth: 14,
        itemHeight: 8,
        icon: 'roundRect',
        textStyle: { color: '#78716c', fontSize: 10 },
        inactiveColor: 'rgba(120,113,108,0.35)',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(24,24,27,0.92)',
        borderColor: 'rgba(245,158,11,0.4)',
        textStyle: { color: '#e4e4e7', fontSize: 11 },
        // 날짜에 요일 포함(2026-07-16) + 값은 #랭크.
        formatter: (ps: unknown) => {
          const arr = ps as { seriesName: string; dataIndex: number; value: number | null; marker: string }[];
          if (!arr.length) return '';
          const lines = arr
            .map((a) => `${a.marker} ${a.seriesName} <b>${a.value == null ? '-' : `#${a.value}`}</b>`)
            .join('<br/>');
          return `${datesFull[arr[0]!.dataIndex]}<br/>${lines}`;
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(120,113,108,0.3)' } },
        axisTick: { show: false },
        axisLabel: { color: '#78716c', fontSize: 9 },
      },
      yAxis: {
        type: 'value',
        inverse: true, // 1위가 위
        min: 1,
        minInterval: 1,
        axisLabel: { color: '#78716c', fontSize: 9, formatter: '#{value}' },
        splitLine: { lineStyle: { color: 'rgba(120,113,108,0.12)' } },
      },
      series: SERIES.map((sr) => ({
        name: sr.name,
        type: 'line',
        data: points.map((p) => p[sr.key]),
        smooth: 0.3,
        symbol: 'circle',
        symbolSize: 4,
        connectNulls: true,
        lineStyle: { color: sr.color, width: 2 },
        itemStyle: { color: sr.color },
      })),
      animationDuration: 450,
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [points]);

  return <div ref={ref} className="h-[190px] w-full" />;
}
