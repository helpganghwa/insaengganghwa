'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { ATTR_REGION_COLOR, ATTR_REGION_KO, type AttrRegion } from '@/lib/game/balance';

echarts.use([BarChart, GridComponent, SVGRenderer]);

export type Pair = {
  /** 왼쪽 축 = 내 지역 · 오른쪽 축 = 상대 지역(방향과 무관하게 좌=나 고정). */
  myRegion: AttrRegion;
  myVal: number;
  oppRegion: AttrRegion;
  oppVal: number;
  gain: number;
  /** true = 내가 상대를 때리는 몫 · false = 상대가 나를 때리는 몫. */
  mine: boolean;
};

export const PAIR_ROW_H = 28;

/**
 * 지역별 상성 기여 — 좌축=내 지역/수치, 우축=상대 지역/수치, 가운데 막대=기여 %.
 * 초록=내 공격 / 붉은=상대 공격. 라벨은 전부 ECharts 축이 담당(오버레이 없음).
 */
export function AttrPairChart({ pairs }: { pairs: Pair[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || pairs.length === 0) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const asc = [...pairs].reverse(); // category y축은 data[0]이 아래
    const max = Math.max(...pairs.map((p) => p.gain), 5);
    const inside = (v: number) => v >= max * 0.3;

    const axisBase = {
      type: 'category' as const,
      axisLine: { show: false },
      axisTick: { show: false },
    };

    chart.setOption({
      animationDuration: 480,
      animationEasing: 'cubicOut',
      grid: { left: 66, right: 66, top: 3, bottom: 3 },
      xAxis: { type: 'value', max, show: false },
      yAxis: [
        {
          ...axisBase,
          data: asc.map((p) => `${ATTR_REGION_KO[p.myRegion]} ${p.myVal}`),
          axisLabel: {
            fontSize: 10,
            fontWeight: 800,
            margin: 8,
            color: (_v: string, i: number) => ATTR_REGION_COLOR[asc[i]!.myRegion],
          },
        },
        {
          ...axisBase,
          position: 'right',
          data: asc.map((p) => `${ATTR_REGION_KO[p.oppRegion]} ${p.oppVal}`),
          axisLabel: {
            fontSize: 10,
            fontWeight: 800,
            margin: 8,
            color: (_v: string, i: number) => ATTR_REGION_COLOR[asc[i]!.oppRegion],
          },
        },
      ],
      series: [
        {
          type: 'bar',
          barWidth: 11,
          showBackground: true,
          backgroundStyle: { color: 'rgba(255,255,255,0.06)' },
          data: asc.map((p) => ({
            value: p.gain,
            itemStyle: { color: p.mine ? '#10b981' : '#f43f5e' },
            label: {
              show: true,
              position: inside(p.gain) ? 'insideRight' : 'right',
              distance: 5,
              color: inside(p.gain) ? '#fff' : p.mine ? '#10b981' : '#f43f5e',
              formatter: `+${p.gain.toFixed(1)}%`,
            },
          })),
          label: { fontSize: 9.5, fontWeight: 900, fontFamily: 'ui-monospace, Menlo, monospace' },
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [pairs]);

  return <div ref={ref} style={{ width: '100%', height: pairs.length * PAIR_ROW_H }} />;
}
