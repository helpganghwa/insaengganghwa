'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import type { DailyEnhancePoint, DatedRankPoint } from '@/lib/game/today/stats';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

const dayKo = (d: string) => '일월화수목금토'[new Date(`${d}T12:00:00Z`).getUTCDay()];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function useChart(build: (chart: echarts.EChartsType) => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
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

/** 일별 단련 시간 스택바 — 결과별 대기시간 합(h). 시도 횟수는 성장할수록 줄어 y축 부적합
 *  (고레벨=긴 대기=큰 막대 — 우상향 성장 서사, 2026-07-16 확정). 툴팁에 횟수 병기. */
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
          const totalH = Math.round((p.successH + p.holdH + p.downH) * 10) / 10;
          const cnt = { 성공: p.success, 유지: p.hold, 하락: p.down } as Record<string, number>;
          return `${md(p.kstDay)} (${dayKo(p.kstDay)}) · ${totalH}시간 단련 · 시도 ${p.success + p.hold + p.down}회<br/>` +
            arr.map((a) => `${a.marker} ${a.seriesName} <b>${a.value}h</b> (${cnt[a.seriesName] ?? 0}회)`).join('<br/>');
        },
      },
      xAxis: { type: 'category', data: dates, ...AXIS },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(120,113,108,0.12)' } }, axisLabel: { ...AXIS.axisLabel, formatter: '{value}h' } },
      series: [
        { name: '성공', type: 'bar', stack: 'e', data: points.map((p) => p.successH), itemStyle: { color: '#34d399' }, barMaxWidth: 10 },
        { name: '유지', type: 'bar', stack: 'e', data: points.map((p) => p.holdH), itemStyle: { color: '#71717a' }, barMaxWidth: 10 },
        { name: '하락', type: 'bar', stack: 'e', data: points.map((p) => p.downH), itemStyle: { color: '#f87171' }, barMaxWidth: 10 },
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
