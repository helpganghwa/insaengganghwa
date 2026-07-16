'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import type { RankPoint } from '@/lib/game/today/stats';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/**
 * 전투력 랭킹 추이 차트(ECharts treeshaken, 2026-07-16) — 1위가 위(inverse y),
 * 앰버 라인+그라데이션 영역, 툴팁(날짜·랭크·전투력), 마지막 점 강조.
 */
export function RankChartClient({ points }: { points: RankPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const dates = points.map((p) => `${Number(p.kstDay.slice(5, 7))}/${Number(p.kstDay.slice(8, 10))}`);
    chart.setOption({
      grid: { left: 34, right: 14, top: 14, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(24,24,27,0.92)',
        borderColor: 'rgba(245,158,11,0.4)',
        textStyle: { color: '#e4e4e7', fontSize: 11 },
        formatter: (ps: unknown) => {
          const p = (ps as { dataIndex: number }[])[0]!;
          const pt = points[p.dataIndex]!;
          return `${dates[p.dataIndex]} · <b>#${pt.rank}</b><br/>전투력 ${pt.combat.toLocaleString('ko-KR')}`;
        },
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(120,113,108,0.3)' } },
        axisTick: { show: false },
        axisLabel: { color: '#78716c', fontSize: 9, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        inverse: true, // 1위가 위
        min: 1,
        minInterval: 1,
        axisLabel: { color: '#78716c', fontSize: 9, formatter: '#{value}' },
        splitLine: { lineStyle: { color: 'rgba(120,113,108,0.12)' } },
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => p.rank),
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: (_: unknown, p: { dataIndex: number }) => (p.dataIndex === points.length - 1 ? 8 : 4),
          lineStyle: { color: '#f59e0b', width: 2.5 },
          itemStyle: { color: '#f59e0b', borderColor: '#fff7ed', borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245,158,11,0.02)' },
              { offset: 1, color: 'rgba(245,158,11,0.25)' },
            ]),
          },
        },
      ],
      animationDuration: 500,
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [points]);

  return <div ref={ref} className="h-[170px] w-full" />;
}
