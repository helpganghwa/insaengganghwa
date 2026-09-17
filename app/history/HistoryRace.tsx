'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, SVGRenderer]);

export type RaceRow = {
  key: string;
  name: string;
  count: number;
  color: string;
  emblems: readonly string[];
};

/** 문양 미리 읽기 — 후보를 차례로 시도해 처음 열리는 URL을 길드 키에 묶는다(사라진 옛 문양 → 다음 문양). 프로세스 단위 캐시. */
const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
function resolveEmblem(key: string, urls: readonly string[]): Promise<string | null> {
  const id = `${key}|${urls.join(',')}`;
  const done = resolved.get(id);
  if (done !== undefined) return Promise.resolve(done);
  const p = pending.get(id);
  if (p) return p;
  const run = (async () => {
    for (const u of urls) {
      const ok = await new Promise<boolean>((r) => {
        const img = new Image();
        img.onload = () => r(true);
        img.onerror = () => r(false);
        img.src = u;
      });
      if (ok) {
        resolved.set(id, u);
        return u;
      }
    }
    resolved.set(id, null);
    return null;
  })();
  pending.set(id, run);
  return run;
}

/**
 * 길드 순위 바 레이스(2026-09-17, ECharts bar-race) — 지금 소유 상태의 길드별 구역 수. 점령이 발표될 때마다 막대가 자라고
 * 순서가 뒤바뀐다(realtimeSort). 카테고리는 길드 id로 고정해 개명해도 막대가 이어지고 라벨만 그날 이름으로 바뀐다.
 * 막대 왼쪽 라벨에 문양(미리 읽어 열리는 것만)과 이름. 병합 갱신만 한다(다시 그리면 튄다).
 */
export function HistoryRace({ rows, height = 260 }: { rows: RaceRow[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, null, { renderer: 'svg' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);
  // 문양 미리 읽기 — 새로 열린 문양이 생기면 한 번 더 그린다.
  useEffect(() => {
    let alive = true;
    for (const r of rows) {
      const id = `${r.key}|${r.emblems.join(',')}`;
      if (resolved.has(id) || r.emblems.length === 0) continue;
      void resolveEmblem(r.key, r.emblems).then(() => {
        if (alive) setTick((k) => k + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [rows]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const top = rows.slice(0, 8);
    const emblemOf = (r: RaceRow) => resolved.get(`${r.key}|${r.emblems.join(',')}`) ?? null;
    const byKey = new Map(top.map((r) => [r.key, r]));
    c.setOption(
      {
        animationDuration: 0,
        animationDurationUpdate: 700,
        animationEasing: 'linear',
        animationEasingUpdate: 'cubicOut',
        grid: { left: 4, right: 36, top: 2, bottom: 2, containLabel: true },
        xAxis: { type: 'value', max: 'dataMax', show: false },
        yAxis: {
          type: 'category',
          inverse: true,
          data: top.map((r) => r.key),
          max: 7,
          animationDuration: 300,
          animationDurationUpdate: 300,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#2a251e',
            fontSize: 11.5,
            fontWeight: 700,
            margin: 8,
            formatter: (key: string) => {
              const r = byKey.get(key);
              if (!r) return key;
              return emblemOf(r) ? `{e${key}|} ${r.name}` : r.name;
            },
            rich: Object.fromEntries(
              top
                .filter((r) => emblemOf(r))
                .map((r) => [
                  `e${r.key}`,
                  { width: 14, height: 14, backgroundColor: { image: emblemOf(r)! } },
                ]),
            ),
          },
        },
        series: [
          {
            type: 'bar',
            realtimeSort: true,
            barCategoryGap: '28%',
            data: top.map((r) => ({
              value: r.count,
              itemStyle: { color: r.color, borderRadius: [0, 3, 3, 0] },
            })),
            label: {
              show: true,
              position: 'right',
              valueAnimation: true,
              color: '#2a251e',
              fontSize: 11,
              fontWeight: 700,
              formatter: (p: { value?: unknown }) => `${p.value ?? ''}`,
            },
          },
        ],
      },
      { replaceMerge: ['series'] },
    );
  }, [rows, tick]);
  return <div ref={ref} style={{ height }} aria-label="길드 순위" role="img" />;
}
