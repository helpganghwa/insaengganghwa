'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { PolarComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_ROLL_MAX,
  type AvatarAttr,
} from '@/lib/game/balance';

echarts.use([BarChart, PolarComponent, SVGRenderer]);

/**
 * 코너 미니 차트 — 권역 방향 방사형 막대. 배경·보더 없이 아바타 위에 얹히므로 최대한 작게
 * (정확한 수치는 아래 텍스트가 담당) — 화면을 가리지 않는 것이 최우선.
 */
export function AttrMiniChart({ attrs, size = 52 }: { attrs: AvatarAttr[]; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const vec = Object.fromEntries(runeVectorDesc(attrs));

    chart.setOption({
      animationDuration: 420,
      animationEasing: 'cubicOut',
      polar: { center: ['50%', '50%'], radius: ['22%', '96%'] },
      angleAxis: {
        type: 'category',
        data: AVATAR_ATTR_REGIONS,
        startAngle: 90,
        clockwise: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      radiusAxis: {
        // 한 권역 최대 표기는 3줄 합산이지만, 코너 차트는 한눈 비교용이라 한 줄 최대(50) 기준 클램프.
        max: AVATAR_ATTR_ROLL_MAX + 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          coordinateSystem: 'polar',
          barWidth: '62%',
          roundCap: true,
          showBackground: true,
          backgroundStyle: { color: 'rgba(255,255,255,0.1)' },
          data: AVATAR_ATTR_REGIONS.map((r) => ({
            value: vec[r] ?? 0,
            itemStyle: { color: ATTR_REGION_COLOR[r], opacity: vec[r] ? 1 : 0 },
          })),
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [attrs]);

  return <div ref={ref} style={{ width: size, height: size }} />;
}
