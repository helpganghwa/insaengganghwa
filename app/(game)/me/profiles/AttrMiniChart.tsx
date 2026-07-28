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
 * 코너 미니 차트(C1) — 권역 방향 방사형 막대. 라벨 없이 색·길이만으로 "어느 쪽으로 치우친
 * 아바타"인지 전달(정확한 수치는 아래 텍스트가 담당). 중앙은 `?` 배지가 덮으므로 안쪽 반경을 비운다.
 */
export function AttrMiniChart({ attrs, size = 66 }: { attrs: AvatarAttr[]; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const vec = Object.fromEntries(runeVectorDesc(attrs));

    chart.setOption({
      animationDuration: 420,
      animationEasing: 'cubicOut',
      polar: { center: ['50%', '50%'], radius: ['34%', '94%'] },
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
          backgroundStyle: { color: 'rgba(255,255,255,0.07)' },
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
