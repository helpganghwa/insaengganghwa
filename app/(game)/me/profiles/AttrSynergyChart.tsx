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
/** 상대를 그 권역 100%로 정규화해 비교 가능한 지표로 만든다(공시 §6 식 그대로). */
const NORM = 100 / AVATAR_ATTR_TOTAL_MAX;

/** 유리 — 내가 상대 권역 O를 사냥하는 몫. prey(r)=O ⟺ r=pred(O). */
function advantage(vec: Partial<Record<AttrRegion, number>>, opponent: AttrRegion): number {
  return Math.round((vec[attrPredator(opponent)] ?? 0) * NORM);
}
/** 불리 — 상대 권역 O가 내 권역 prey(O)를 사냥하는 몫. */
function disadvantage(vec: Partial<Record<AttrRegion, number>>, opponent: AttrRegion): number {
  return Math.round((vec[attrPrey(opponent)] ?? 0) * NORM);
}

export type SynergyRow = { region: AttrRegion; adv: number; dis: number };

/** 표시 순서(위→아래) — 순 우위 내림차순. 상단이 가장 유리한 상대. */
export function synergyRows(attrs: AvatarAttr[]): SynergyRow[] {
  const vec = Object.fromEntries(runeVectorDesc(attrs)) as Partial<Record<AttrRegion, number>>;
  return AVATAR_ATTR_REGIONS.map((region) => ({
    region,
    adv: advantage(vec, region),
    dis: disadvantage(vec, region),
  })).sort((a, b) => b.adv - b.dis - (a.adv - a.dis));
}

export const SYNERGY_ROW_H = 30;

/**
 * 상성 대칭 막대(X4) — 중앙 0 기준 왼쪽=불리(붉은) / 오른쪽=유리(초록).
 * 권역 이름은 중앙에 HTML로 겹쳐 그린다(막대 양끝 수치와 충돌 없음) — 행 높이 SYNERGY_ROW_H 고정.
 */
export function AttrSynergyChart({ rows }: { rows: SynergyRow[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const max = Math.max(...rows.flatMap((r) => [r.adv, r.dis]), 10);
    // ECharts category y축은 data[0]이 아래 → 표시 순서를 뒤집어 넣는다.
    const asc = [...rows].reverse();

    chart.setOption({
      animationDuration: 520,
      animationEasing: 'cubicOut',
      grid: { left: 40, right: 40, top: 4, bottom: 4 },
      xAxis: { type: 'value', min: -max, max, show: false },
      yAxis: {
        type: 'category',
        data: asc.map((r) => ATTR_REGION_KO[r.region]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      series: [
        {
          type: 'bar',
          stack: 'x',
          barWidth: 11,
          data: asc.map((r) => ({
            value: -r.dis,
            itemStyle: { borderRadius: [99, 0, 0, 99], color: r.dis ? RED : 'transparent' },
          })),
          label: {
            show: true,
            position: 'left',
            distance: 6,
            fontSize: 11,
            fontWeight: 900,
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            color: RED,
            formatter: (p: { value: number }) => (p.value ? `${p.value}%` : ''),
          },
        },
        {
          type: 'bar',
          stack: 'x',
          barWidth: 11,
          data: asc.map((r) => ({
            value: r.adv,
            itemStyle: { borderRadius: [0, 99, 99, 0], color: r.adv ? GREEN : 'transparent' },
          })),
          label: {
            show: true,
            position: 'right',
            distance: 6,
            fontSize: 11,
            fontWeight: 900,
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            color: GREEN,
            formatter: (p: { value: number }) => (p.value ? `+${p.value}%` : ''),
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
  }, [rows]);

  return <div ref={ref} style={{ width: '100%', height: rows.length * SYNERGY_ROW_H }} />;
}
