'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import type { HistoryStory } from '@/lib/game/history/types';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

const FALLBACK = ['#1e40af', '#b91c1c', '#a16207', '#7c3aed', '#0f766e', '#15803d'];

/**
 * 판도 차트(2026-09-16, A안) — 길드별 보유 구역 수를 날짜축에 그린다. `upTo`까지만 값이 있고 그 뒤는 비워
 * 재생과 함께 선이 자란다(오늘 이후는 숨김 — 끝까지 본 뒤 전체 공개). 세로 점선 = 지금 날. 클릭 = 그날로 이동.
 * 오늘의 기록 차트(RankChartClient)와 같은 echarts/core + SVG 렌더러.
 */
export function HistoryChart({
  days,
  story,
  upTo,
  current,
  onPick,
}: {
  days: string[];
  story: HistoryStory;
  /** 이 인덱스(포함)까지 값 표시. */
  upTo: number;
  /** 세로 점선 위치(없으면 -1). */
  current: number;
  onPick: (dayIdx: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const zr = chart.getZr();
    const click = (e: { offsetX: number; offsetY: number }) => {
      const p = chart.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY]) as number[] | undefined;
      if (!p) return;
      const i = Math.round(p[0]!);
      if (i >= 0 && i < days.length) onPickRef.current(i);
    };
    zr.on('click', click);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      zr.off('click', click);
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const x = days.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`);
    const maxY = Math.max(5, ...story.counts.flat());
    chart.setOption(
      {
        animationDuration: 400,
        animationDurationUpdate: 400,
        grid: { left: 26, right: 10, top: 8, bottom: 20 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(42,37,30,0.94)',
          borderColor: 'rgba(138,75,35,0.5)',
          textStyle: { color: '#f5f0e6', fontSize: 11 },
          formatter: (ps: unknown) => {
            const arr = (ps as { seriesName: string; dataIndex: number; value: number | null; marker: string }[]).filter((a) => a.value != null);
            if (!arr.length) return '';
            return `${days[arr[0]!.dataIndex]}<br/>${arr
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .map((a) => `${a.marker} ${a.seriesName} <b>${a.value}</b>`)
              .join('<br/>')}`;
          },
        },
        xAxis: {
          type: 'category',
          data: x,
          boundaryGap: false,
          axisLine: { lineStyle: { color: 'rgba(109,100,85,0.35)' } },
          axisTick: { show: false },
          axisLabel: { color: '#6d6455', fontSize: 9, interval: Math.max(0, Math.ceil(days.length / 8) - 1) },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: maxY,
          interval: maxY >= 30 ? 10 : 5,
          axisLabel: { color: '#6d6455', fontSize: 9 },
          splitLine: { lineStyle: { color: 'rgba(109,100,85,0.15)' } },
        },
        series: story.guilds.map((g, gi) => ({
          name: g.name,
          type: 'line',
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 3,
          showSymbol: false,
          lineStyle: { width: 2, color: g.color ?? FALLBACK[gi % FALLBACK.length] },
          itemStyle: { color: g.color ?? FALLBACK[gi % FALLBACK.length] },
          emphasis: { focus: 'series' },
          data: story.counts.map((row, i) => (i <= upTo ? row[gi] ?? 0 : null)),
          ...(gi === 0 && current >= 0
            ? {
                markLine: {
                  silent: true,
                  symbol: 'none',
                  animation: false,
                  lineStyle: { color: '#8a4b23', type: 'dashed', width: 1 },
                  label: { show: false },
                  data: [{ xAxis: current }],
                },
              }
            : { markLine: { data: [] } }),
        })),
      },
      { replaceMerge: ['series'] },
    );
  }, [days, story, upTo, current]);

  return (
    <div className="relative">
      <div ref={ref} className="h-[128px] w-full" aria-label="영토 판도 차트" />
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#6d6455]">
        {story.guilds.map((g, gi) => (
          <span key={g.id} className="inline-flex items-center gap-1">
            <i className="inline-block h-[2px] w-[10px]" style={{ background: g.color ?? FALLBACK[gi % FALLBACK.length] }} />
            {g.name}
          </span>
        ))}
      </div>
    </div>
  );
}
