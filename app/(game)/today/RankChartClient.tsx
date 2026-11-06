'use client';

import type { RankPoint } from '@/lib/game/today/stats';

import { LineRankSvg } from './LineRankSvg';
import { rankAxisRange } from './rank-axis';
import { marker } from './svg-chart';

/**
 * 랭킹 추이 차트(2026-07-16) — 전투력/최고/합산 3지표 멀티라인, 범례 탭으로 토글.
 * 1위가 위(inverse y), 툴팁은 보이는 시리즈 일괄 표시.
 * 2026-11-06 업데이트 18: echarts → 손수 SVG(LineRankSvg) — 옵션 값(격자·범례·색·곡선·툴팁 문구)은 그대로.
 */
const SERIES = [
  { key: 'combat', name: '전투력', color: '#f59e0b' },
  { key: 'max', name: '최고', color: '#38bdf8' },
  { key: 'sum', name: '합산', color: '#34d399' },
] as const;

export function RankChartClient({ points }: { points: RankPoint[] }) {
  const dates = points.map((p) => `${Number(p.kstDay.slice(5, 7))}/${Number(p.kstDay.slice(8, 10))}`);
  const datesFull = points.map(
    (p) => `${Number(p.kstDay.slice(5, 7))}/${Number(p.kstDay.slice(8, 10))} (${'일월화수목금토'[new Date(`${p.kstDay}T12:00:00Z`).getUTCDay()]})`,
  );
  const series = SERIES.map((sr) => ({ name: sr.name, color: sr.color, data: points.map((p) => p[sr.key]) }));
  return (
    <LineRankSvg
      height={190}
      grid={{ left: 34, right: 12, top: 34, bottom: 22 }}
      labels={dates}
      series={series}
      // 범위·간격을 직접 고정한다 — 이유는 rank-axis.ts 주석(1등 라벨 소실·0.5등 발생).
      range={rankAxisRange(points.flatMap((p) => SERIES.map((s) => p[s.key])))}
      legend={{ itemW: 14, itemH: 8, fontSize: 10 }}
      // 날짜에 요일 포함(2026-07-16) + 값은 #랭크.
      tooltip={(i, visible) =>
        `${datesFull[i]}<br/>` +
        visible
          .map((si) => {
            const s = series[si]!;
            const v = s.data[i];
            return `${marker(s.color)} ${s.name} <b>${v == null ? '-' : `#${v}`}</b>`;
          })
          .join('<br/>')
      }
      animMs={450}
    />
  );
}
