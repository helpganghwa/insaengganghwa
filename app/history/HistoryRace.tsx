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

/** 한 길드 막대만 강조(나머지는 emphasis.focus='self'로 흐려짐). key가 없거나 없는 길드면 전부 해제. */
function applyHighlight(c: echarts.ECharts, cats: string[], key: string | null) {
  c.dispatchAction({ type: 'downplay', seriesIndex: 0 });
  const di = key ? cats.indexOf(key) : -1;
  if (di >= 0) c.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: di });
}

/** 보이는 막대 수 — 그 아래 순위는 화면 밖으로 밀려 내려가고(realtimeSort), 올라오면 아래에서 들어온다. */
const VISIBLE = 8;
/** 라벨 열 폭(px) — 문양 14 + 이름. 고정이라 문양이 늦게 열려도 막대 영역이 움직이지 않는다. */
const LABEL_W = 104;
/** 값 변화·순위 교체에 걸리는 시간(ms) — 점령 한 건이 지도에 닿는 간격과 비슷하게. 선형이라 연속 갱신이 끊기지 않는다. */
const UPDATE_MS = 1000;

/**
 * 길드 순위 바 레이스(2026-09-17, ECharts bar-race) — 지금 소유 상태의 길드별 구역 수. 점령이 발표될 때마다 막대가 자라고
 * 순서가 뒤바뀐다(realtimeSort). 카테고리는 길드 id로 고정해 개명해도 막대가 이어지고 라벨만 그날 이름으로 바뀐다.
 *
 * 부드럽게 움직이는 조건(2026-09-18, 공식 bar-race 예제와 같게):
 *  - 카테고리 목록은 **한 번 등장한 길드를 순서 그대로 유지**한다(빠진 길드는 0). 매번 순위대로 다시 넘기면 ECharts가
 *    카테고리를 새로 배치해 막대가 튀고, replaceMerge로 시리즈를 갈아 끼우면 애니메이션이 아예 끊긴다.
 *  - 값·순위 갱신은 선형 UPDATE_MS. 라벨 숫자는 valueAnimation으로 함께 굴러간다.
 */
export function HistoryRace({
  rows,
  height = 260,
  onFocus,
  focusKey = null,
}: {
  rows: RaceRow[];
  height?: number;
  /** 막대·이름에 올린 길드(이름) — 지도가 그 길드 구역을 밝힌다(2026-09-18). 벗어나면 null. */
  onFocus?: (name: string | null) => void;
  /** 밖(지도 표식·글 속 이름)에서 호버한 길드의 행 키 — 이 막대만 밝히고 나머지는 흐리게. */
  focusKey?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusRef = useRef(onFocus);
  useEffect(() => {
    focusRef.current = onFocus;
  }, [onFocus]);
  const focusKeyRef = useRef(focusKey);
  const chart = useRef<echarts.ECharts | null>(null);
  /** 등장 순서대로 고정된 카테고리(길드 키). 한 번 들어오면 빠지지 않는다. */
  const cats = useRef<string[]>([]);
  /** 마지막으로 본 이름·색·문양(키별) — 순위 밖으로 밀린 길드의 라벨도 남는다. */
  const seenRef = useRef(new Map<string, RaceRow>());
  /** 첫 데이터는 애니메이션 없이 그린다(첫 화면에서 막대가 0에서 자라지 않게 — 2026-09-18 사용자 지시). */
  const primedRef = useRef(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, null, { renderer: 'svg' });
    chart.current = c;
    c.setOption({
      animationDuration: 0,
      animationDurationUpdate: UPDATE_MS,
      animationEasing: 'linear',
      animationEasingUpdate: 'linear',
      // 라벨 폭을 고정한다(containLabel 금지) — 문양이 나중에 붙으면서 라벨이 넓어지면 막대가 줄어드는 애니메이션이 첫 화면에 보였다(09-18).
      grid: { left: LABEL_W, right: 36, top: 2, bottom: 2, containLabel: false },
      xAxis: { type: 'value', max: 'dataMax', show: false },
      yAxis: {
        type: 'category',
        inverse: true,
        data: [],
        max: VISIBLE - 1,
        animationDuration: 300,
        animationDurationUpdate: 300,
        axisLine: { show: false },
        axisTick: { show: false },
        // 이름에 올려도 막대와 같이 강조한다.
        triggerEvent: true,
        axisLabel: {
          color: '#2a251e',
          fontSize: 11.5,
          fontWeight: 700,
          margin: 8,
          width: LABEL_W - 12,
          overflow: 'truncate',
        },
      },
      series: [
        {
          type: 'bar',
          realtimeSort: true,
          barCategoryGap: '28%',
          cursor: 'default',
          emphasis: { focus: 'self' },
          blur: { itemStyle: { opacity: 0.3 } },
          data: [],
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
    });
    // 호버 강조 — 막대(series)와 이름(yAxis) 어느 쪽이든 그 길드를 강조하고 이름을 밖으로 알린다.
    // 막대 → 이름으로 옮길 때 잠깐 비는 mouseout은 80ms 유예로 흡수해 지도가 깜빡이지 않게.
    let clearT: ReturnType<typeof setTimeout> | null = null;
    const focus = (key: string) => {
      if (clearT) {
        clearTimeout(clearT);
        clearT = null;
      }
      applyHighlight(c, cats.current, key);
      focusRef.current?.(seenRef.current.get(key)?.name ?? null);
    };
    const blur = () => {
      if (clearT) clearTimeout(clearT);
      clearT = setTimeout(() => {
        clearT = null;
        focusRef.current?.(null);
      }, 80);
    };
    c.on('mouseover', (raw) => {
      const p = raw as { componentType?: string; dataIndex?: number; value?: unknown };
      const key =
        p.componentType === 'series' && typeof p.dataIndex === 'number'
          ? cats.current[p.dataIndex]
          : p.componentType === 'yAxis'
            ? String(p.value)
            : undefined;
      if (key) focus(key);
    });
    c.on('mouseout', blur);
    c.on('globalout', blur);
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      if (clearT) clearTimeout(clearT);
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);
  // 밖에서 정한 강조(지도 표식·글 속 이름·이 차트 자신의 호버가 부모를 거쳐 돌아온 값).
  useEffect(() => {
    focusKeyRef.current = focusKey;
    if (chart.current) applyHighlight(chart.current, cats.current, focusKey);
  }, [focusKey]);
  // 문양 미리 읽기 — 새로 열린 문양이 생기면 라벨만 한 번 더 그린다.
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
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const r of rows) if (!cats.current.includes(r.key)) cats.current.push(r.key);
    const emblemOf = (r: RaceRow) => resolved.get(`${r.key}|${r.emblems.join(',')}`) ?? null;
    // 라벨은 마지막으로 본 이름·문양을 기억한다(순위 밖으로 밀린 길드도 카테고리는 남는다).
    const seen = seenRef.current;
    for (const r of rows) seen.set(r.key, r);
    const first = !primedRef.current && rows.length > 0;
    if (first) primedRef.current = true;
    c.setOption({
      animationDurationUpdate: first ? 0 : UPDATE_MS,
      yAxis: {
        animationDurationUpdate: first ? 0 : 300,
        data: cats.current,
        axisLabel: {
          formatter: (key: string) => {
            const r = byKey.get(key) ?? seen.get(key);
            if (!r) return key;
            return emblemOf(r) ? `{e${key}|} ${r.name}` : r.name;
          },
          rich: Object.fromEntries(
            [...seen.values()]
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
          data: cats.current.map((key) => {
            const r = byKey.get(key);
            return {
              value: r?.count ?? 0,
              itemStyle: {
                color: (r ?? seen.get(key))?.color ?? '#9a917f',
                borderRadius: [0, 3, 3, 0],
              },
            };
          }),
        },
      ],
    });
    // 데이터 갱신이 강조 상태를 풀 수 있어 다시 건다.
    if (focusKeyRef.current) applyHighlight(c, cats.current, focusKeyRef.current);
  }, [rows, tick]);
  return <div ref={ref} style={{ height }} aria-label="길드 순위" role="img" />;
}
