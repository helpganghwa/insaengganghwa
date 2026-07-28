'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { ATTR_REGION_COLOR, ATTR_REGION_KO, type AttrRegion } from '@/lib/game/balance';

echarts.use([BarChart, GridComponent, SVGRenderer]);

export type Pair = {
  /** 때리는 쪽 지역 · 맞는 쪽 지역 */
  from: AttrRegion;
  to: AttrRegion;
  fromVal: number;
  toVal: number;
  gain: number;
  /** true = 내가 상대에게 · false = 상대가 나에게 */
  mine: boolean;
};

export const PAIR_ROW_H = 26;

/**
 * 상성 기여 차트 — "어떤 지역이 어떤 지역에게 +N%"를 한 줄씩. 초록=내 공격 / 붉은=상대 공격.
 * y축 라벨(천사 59 ▸ 왕국 40)은 ECharts 축이 담당해 오버레이가 없다.
 */
export function AttrPairChart({ pairs }: { pairs: Pair[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || pairs.length === 0) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const asc = [...pairs].reverse(); // category y축은 data[0]이 아래
    const max = Math.max(...pairs.map((p) => p.gain), 5);

    chart.setOption({
      animationDuration: 480,
      animationEasing: 'cubicOut',
      grid: { left: 96, right: 44, top: 3, bottom: 3 },
      xAxis: { type: 'value', max, show: false },
      yAxis: {
        type: 'category',
        data: asc.map((p) => `${ATTR_REGION_KO[p.from]} ${p.fromVal} ▸ ${ATTR_REGION_KO[p.to]} ${p.toVal}`),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10,
          fontWeight: 700,
          margin: 8,
          color: (_v: string, i: number) => ATTR_REGION_COLOR[asc[i]!.from],
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: 9,
          showBackground: true,
          backgroundStyle: { color: 'rgba(255,255,255,0.06)', borderRadius: 99 },
          data: asc.map((p) => ({
            value: p.gain,
            itemStyle: {
              borderRadius: 99,
              color: p.mine
                ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#10b98155' },
                    { offset: 1, color: '#10b981' },
                  ])
                : new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#f43f5e55' },
                    { offset: 1, color: '#f43f5e' },
                  ]),
            },
          })),
          label: {
            show: true,
            position: 'right',
            distance: 6,
            fontSize: 10.5,
            fontWeight: 900,
            fontFamily: 'ui-monospace, Menlo, monospace',
            formatter: (p: { dataIndex: number }) => `+${asc[p.dataIndex]!.gain.toFixed(1)}%`,
            color: (p: { dataIndex: number }) => (asc[p.dataIndex]!.mine ? '#10b981' : '#f43f5e'),
          },
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
