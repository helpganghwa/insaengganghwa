'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_TOTAL_MAX,
  attrPredator,
  attrPrey,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

echarts.use([BarChart, GridComponent, SVGRenderer]);

/**
 * 상대 권역별 내 공격 우위(B-3) — "상대가 그 권역 100%일 때 내 보정 +N%".
 * balance §10 식 그대로: Σ 내[r] × (상대[prey(r)] / 150). 상대를 100으로 정규화해 비교 가능한 지표로.
 */
function advantageAgainst(attrs: AvatarAttr[], opponent: AttrRegion): number {
  let adv = 0;
  for (const [r, v] of runeVectorDesc(attrs)) {
    if (attrPrey(r) === opponent) adv += v * (100 / AVATAR_ATTR_TOTAL_MAX);
  }
  return Math.round(adv);
}
/** 그 권역이 나를 노리는지(내 권역의 천적) — 불리 표시용. */
function isThreat(attrs: AvatarAttr[], opponent: AttrRegion): boolean {
  return runeVectorDesc(attrs).some(([r]) => attrPredator(r) === opponent);
}

/** 다크 여부 — 앱은 media 기반 다크. 차트 색은 CSS 변수를 못 쓰므로 직접 분기. */
function isDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function AttrSynergyChart({ attrs }: { attrs: AvatarAttr[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const dark = isDark();

    // 우위 큰 순 → 아래에서 위로 쌓이도록 역순(ECharts y축 category는 아래가 index 0).
    const rows = AVATAR_ATTR_REGIONS.map((r) => ({
      region: r,
      adv: advantageAgainst(attrs, r),
      threat: isThreat(attrs, r),
    }))
      .sort((a, b) => a.adv - b.adv || AVATAR_ATTR_REGIONS.indexOf(b.region) - AVATAR_ATTR_REGIONS.indexOf(a.region));

    const maxAdv = Math.max(...rows.map((x) => x.adv), 10);
    const labelColor = dark ? '#a1a1aa' : '#71717a';
    const trackColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    chart.setOption({
      animationDuration: 520,
      animationEasing: 'cubicOut',
      grid: { left: 42, right: 46, top: 4, bottom: 4, containLabel: false },
      xAxis: { type: 'value', max: maxAdv, show: false },
      yAxis: {
        type: 'category',
        data: rows.map((x) => ATTR_REGION_KO[x.region]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 11.5,
          fontWeight: 800,
          margin: 10,
          color: (_v: string, i: number) =>
            rows[i]!.adv > 0 ? ATTR_REGION_COLOR[rows[i]!.region] : labelColor,
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: 9,
          // 트랙(배경) — 값이 0인 행도 자리를 보여줘 리듬이 유지된다.
          showBackground: true,
          backgroundStyle: { color: trackColor, borderRadius: 99 },
          data: rows.map((x) => ({
            value: x.adv,
            itemStyle: {
              borderRadius: 99,
              color:
                x.adv > 0
                  ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                      { offset: 0, color: `${ATTR_REGION_COLOR[x.region]}66` },
                      { offset: 1, color: ATTR_REGION_COLOR[x.region] },
                    ])
                  : 'transparent',
            },
          })),
          label: {
            show: true,
            position: 'right',
            distance: 8,
            fontSize: 11.5,
            fontWeight: 900,
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            formatter: (p: { dataIndex: number }) => {
              const row = rows[p.dataIndex]!;
              return row.adv > 0 ? `+${row.adv}%` : row.threat ? '불리' : '—';
            },
            color: (p: { dataIndex: number }) => {
              const row = rows[p.dataIndex]!;
              return row.adv > 0 ? ATTR_REGION_COLOR[row.region] : row.threat ? '#f43f5e' : labelColor;
            },
          },
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onTheme = () => chart.dispose(); // 테마 전환 시 재마운트에 맡김(모달은 짧게 뜬다)
    mq?.addEventListener?.('change', onTheme);
    return () => {
      window.removeEventListener('resize', onResize);
      mq?.removeEventListener?.('change', onTheme);
      chart.dispose();
    };
  }, [attrs]);

  return <div ref={ref} className="h-[168px] w-full" />;
}
