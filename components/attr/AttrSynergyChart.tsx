'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_TOTAL_MAX,
  attrPredator,
  attrPrey,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

echarts.use([BarChart, GridComponent, SVGRenderer]);

const GREEN = '#10b981';
const RED = '#f43f5e';
/** 상대를 그 지역 100%로 정규화해 비교 가능한 지표로(공시 §6 식 그대로). */
const NORM = 100 / AVATAR_ATTR_TOTAL_MAX;

/** 유리 — prey(r)=O ⟺ r=pred(O). 불리 — 상대 O가 내 prey(O)를 사냥. */
const advantage = (v: Partial<Record<AttrRegion, number>>, o: AttrRegion) =>
  Math.round((v[attrPredator(o)] ?? 0) * NORM);
const disadvantage = (v: Partial<Record<AttrRegion, number>>, o: AttrRegion) =>
  Math.round((v[attrPrey(o)] ?? 0) * NORM);

export type SynergyRow = { region: AttrRegion; adv: number; dis: number };

/** 표시 순서(위→아래) — 순 우위 내림차순. */
export function synergyRows(attrs: AvatarAttr[]): SynergyRow[] {
  const vec = Object.fromEntries(runeVectorDesc(attrs)) as Partial<Record<AttrRegion, number>>;
  return AVATAR_ATTR_REGIONS.map((region) => ({
    region,
    adv: advantage(vec, region),
    dis: disadvantage(vec, region),
  })).sort((a, b) => b.adv - b.dis - (a.adv - a.dis));
}

export const SYNERGY_ROW_H = 27;

/**
 * 상성 대칭 막대(P1) — 좌=불리 / 우=유리, 지역명은 **실제 y축**(오버레이 없음).
 * 수치는 막대 안(짧은 막대는 바깥)에 두어 축과 겹치지 않는다.
 */
export function AttrSynergyChart({ rows }: { rows: SynergyRow[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const max = Math.max(...rows.flatMap((r) => [r.adv, r.dis]), 10);
    const asc = [...rows].reverse(); // ECharts category y축은 data[0]이 아래

    // 막대가 짧으면 안쪽 라벨이 잘리므로 바깥으로 뺀다(전체 폭의 22% 기준).
    const inside = (v: number) => v >= max * 0.22;

    chart.setOption({
      animationDuration: 500,
      animationEasing: 'cubicOut',
      grid: { left: 34, right: 10, top: 2, bottom: 2 },
      xAxis: { type: 'value', min: -max, max, show: false },
      yAxis: {
        type: 'category',
        data: asc.map((r) => ATTR_REGION_KO[r.region]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#d4d4d8', fontSize: 11, fontWeight: 800, margin: 8 },
      },
      series: [
        {
          type: 'bar',
          stack: 'x',
          barWidth: 12,
          data: asc.map((r) => ({
            value: -r.dis,
            itemStyle: { borderRadius: [99, 0, 0, 99], color: r.dis ? RED : 'transparent' },
            label: r.dis
              ? {
                  show: true,
                  position: inside(r.dis) ? 'insideLeft' : 'left',
                  distance: 5,
                  color: inside(r.dis) ? '#fff' : RED,
                  formatter: `${r.dis}%`,
                }
              : { show: false },
          })),
          label: { fontSize: 10, fontWeight: 900, fontFamily: 'ui-monospace, Menlo, monospace' },
        },
        {
          type: 'bar',
          stack: 'x',
          barWidth: 12,
          data: asc.map((r) => ({
            value: r.adv,
            itemStyle: { borderRadius: [0, 99, 99, 0], color: r.adv ? GREEN : 'transparent' },
            label: r.adv
              ? {
                  show: true,
                  position: inside(r.adv) ? 'insideRight' : 'right',
                  distance: 5,
                  color: inside(r.adv) ? '#fff' : GREEN,
                  formatter: `${r.adv}%`,
                }
              : { show: false },
          })),
          label: { fontSize: 10, fontWeight: 900, fontFamily: 'ui-monospace, Menlo, monospace' },
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [rows]);

  return <div ref={ref} style={{ width: '100%', height: rows.length * SYNERGY_ROW_H }} />;
}
