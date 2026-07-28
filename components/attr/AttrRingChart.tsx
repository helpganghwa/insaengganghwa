'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([PieChart, SVGRenderer]);

/**
 * 상성 우위 링 — 내 보정 : 상대 보정 비율 도넛. SVG 수동 애니메이션 대신 ECharts 파이의
 * 기본 확장 애니메이션을 써서 다른 차트(막대)와 등장 결을 맞춘다. 가운데 텍스트는 호출처가 겹쳐 그린다.
 */
export function AttrRingChart({
  myAdv,
  oppAdv,
  size = 86,
}: {
  myAdv: number;
  oppAdv: number;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const total = myAdv + oppAdv;

    chart.setOption({
      animationDuration: 620,
      animationEasing: 'cubicOut',
      series: [
        {
          type: 'pie',
          radius: ['74%', '100%'],
          center: ['50%', '50%'],
          startAngle: 90,
          silent: true,
          label: { show: false },
          labelLine: { show: false },
          // 보정이 전혀 없으면 흐린 단일 링으로.
          data:
            total > 0
              ? [
                  { value: myAdv, itemStyle: { color: '#10b981' } },
                  { value: oppAdv, itemStyle: { color: '#f43f5e' } },
                ]
              : [{ value: 1, itemStyle: { color: 'rgba(255,255,255,0.1)' } }],
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [myAdv, oppAdv]);

  return <div ref={ref} style={{ width: size, height: size }} />;
}
