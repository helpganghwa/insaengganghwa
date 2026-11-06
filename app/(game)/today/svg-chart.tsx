'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * /today 차트용 손수 SVG(2026-11-06 업데이트 18) — echarts(약 172KB gz)를 걷어내고 쓰던 모양을 그대로 그린다.
 *
 * echarts 기본값을 옮겨 왔다(값의 출처를 주석으로 남긴다 — 바꾸면 종전 그림과 달라진다).
 *  - 글꼴 `9px/10px sans-serif`(echarts 기본 글꼴), 축 라벨 여백 8px, 범례 안쪽 여백 5px·아이콘-글자 5px·항목 간격 10px.
 *  - 가로축 라벨 간격 = floor(라벨 최대 폭 × 1.3 ÷ 칸 폭)(echarts calculateCategoryInterval).
 *  - 곡선 smooth 0.3 = echarts poly.js drawSegment(비단조) 이식, 점 사이 null은 건너 잇는다(connectNulls).
 *  - 값 축 눈금 = echarts nice(간격 = nice(범위/5, 반올림)) · 막대 폭 = 칸 × 0.8(barCategoryGap 20%) 상한 barMaxWidth.
 *  - 툴팁: 커서 +20px(넘치면 반대쪽), 0.4초 cubic-bezier(0.23,1,0.32,1) 이동, 패딩 10·테두리 1·반경 4·그림자 1 2 10 .2.
 *  - 가리킨 칸: 점선(4 2) #b7b9be 세로줄, 점은 1.5배, 막대·점은 색 10% 밝게(echarts liftColor).
 *  - 첫 표시: 선은 왼쪽부터 드러남(선형), 막대는 아래에서 자람(cubicInOut).
 */

export const FONT = 'sans-serif';
const AXIS_LINE = 'rgba(120,113,108,0.3)';
const SPLIT_LINE = 'rgba(120,113,108,0.12)';
const LABEL = '#78716c';
const POINTER = '#b7b9be';

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** 글자 폭(px) — echarts와 같은 canvas measureText. DOM 없으면 대략값. */
export function textWidth(text: string, size: number): number {
  if (measureCtx === undefined) measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!measureCtx) return text.length * size * 0.6;
  measureCtx.font = `${size}px ${FONT}`;
  return measureCtx.measureText(text).width;
}

/** echarts liftColor(-0.1) — 채널마다 ×1.1(내림). */
export function liftColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.min(255, (c * 1.1) | 0));
  return `rgb(${ch.join(',')})`;
}

/** echarts numberUtil.nice. */
function nice(val: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(val));
  const exp10 = 10 ** exponent;
  const f = val / exp10;
  const nf = round ? (f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10) : f < 1 ? 1 : f < 2 ? 2 : f < 3 ? 3 : f < 5 ? 5 : 10;
  return +(nf * exp10).toFixed(exponent < 0 ? -exponent : 0);
}

/** 0을 포함하는 값 축의 nice 눈금(echarts IntervalScale, splitNumber 5). */
export function niceAxis(maxValue: number): { min: number; max: number; interval: number } {
  let max = Math.max(0, maxValue);
  if (max === 0) max = 1; // 범위 0 → echarts는 [0, 1]로 벌린다
  const interval = nice(max / 5, true);
  const prec = Math.max(0, -Math.floor(Math.log10(interval)));
  return { min: 0, max: +(Math.ceil(max / interval) * interval).toFixed(prec), interval };
}

/** 눈금 라벨 숫자 — 간격 자릿수로 반올림 + 천 단위 쉼표(echarts addCommas). */
export function tickLabel(v: number, interval: number): string {
  const prec = Math.max(0, -Math.floor(Math.log10(interval)) + (interval % 1 ? 1 : 0));
  return (+v.toFixed(prec)).toLocaleString('en-US', { maximumFractionDigits: prec });
}

/**
 * 라벨이 차트 밖으로 나가지 않게 격자를 넓힌다 — echarts 6 grid outerBounds(기본 auto)와 같은 결과(종전 DOM 실측: 라벨 바깥 여백 3px).
 *  - 왼쪽: 세로축 라벨 최대 폭 + 축 간격 8 + 3.
 *  - 양 끝 칸에 가로축 라벨이 있으면(boundaryGap false) 라벨 반폭 + 3.
 */
export function fitGrid(
  grid: Grid, yLabels: string[], xLabels: string[], width: number, edgeLabels: boolean,
): { grid: Grid; interval: number } {
  const left = Math.max(grid.left, Math.max(0, ...yLabels.map((l) => textWidth(l, 9))) + 8 + 3);
  const n = xLabels.length;
  const unitOf = (g: Grid) => (edgeLabels ? (n > 1 ? (width - g.right - g.left) / (n - 1) : 0) : n > 0 ? (width - g.right - g.left) / n : 0);
  let g: Grid = { ...grid, left };
  let interval = categoryInterval(xLabels, unitOf(g));
  if (edgeLabels && n > 1) {
    const first = Math.max(g.left, textWidth(xLabels[0]!, 9) / 2 + 3);
    const lastShown = (n - 1) % (interval + 1) === 0;
    const right = lastShown ? Math.max(g.right, textWidth(xLabels[n - 1]!, 9) / 2 + 3) : g.right;
    g = { ...g, left: first, right };
    interval = categoryInterval(xLabels, unitOf(g));
  }
  return { grid: g, interval };
}

/** 가로축 라벨 간격(0 = 전부, 1 = 하나 건너 하나 …) — echarts calculateCategoryInterval. */
export function categoryInterval(labels: string[], unitW: number, size = 9): number {
  if (labels.length < 2 || unitW <= 0) return 0;
  let maxW = 7;
  for (const l of labels) maxW = Math.max(maxW, textWidth(l, size) * 1.3);
  return Math.max(0, Math.floor(maxW / unitW));
}

/** smooth 곡선 경로 — echarts poly.js drawSegment(smoothMonotone 없음, connectNulls) 이식. */
export function smoothPath(pts: ([number, number] | null)[], smooth: number): string {
  const valid = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (valid.length === 0) return '';
  const P = (i: number) => pts[i]!;
  let d = '';
  let prevX = 0;
  let prevY = 0;
  let cpx0 = 0;
  let cpy0 = 0;
  for (let k = 0; k < valid.length; k++) {
    let [x, y] = P(valid[k]!);
    if (k === 0) {
      d += `M${x},${y}`;
      cpx0 = x;
      cpy0 = y;
    } else {
      let dx = x - prevX;
      let dy = y - prevY;
      if (dx * dx + dy * dy < 0.5) continue; // 아주 짧은 구간 무시
      let next = valid[k + 1] != null ? P(valid[k + 1]!) : null;
      while (next && next[0] === x && next[1] === y && k < valid.length - 1) {
        k++;
        [x, y] = P(valid[k]!);
        next = valid[k + 1] != null ? P(valid[k + 1]!) : null;
        dx = x - prevX;
        dy = y - prevY;
      }
      let cpx1: number;
      let cpy1: number;
      let nextCpx0 = 0;
      let nextCpy0 = 0;
      if (!next || smooth <= 0) {
        cpx1 = x;
        cpy1 = y;
      } else {
        const [nextX, nextY] = next;
        let vx = nextX - prevX;
        let vy = nextY - prevY;
        const dx0 = x - prevX;
        const dx1 = nextX - x;
        const dy0 = y - prevY;
        const dy1 = nextY - y;
        const lenPrevSeg = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        const lenNextSeg = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const ratioNextSeg = lenNextSeg / (lenNextSeg + lenPrevSeg);
        nextCpx0 = x + vx * smooth * ratioNextSeg;
        nextCpy0 = y + vy * smooth * ratioNextSeg;
        nextCpx0 = Math.max(Math.min(nextCpx0, Math.max(nextX, x)), Math.min(nextX, x));
        nextCpy0 = Math.max(Math.min(nextCpy0, Math.max(nextY, y)), Math.min(nextY, y));
        vx = nextCpx0 - x;
        vy = nextCpy0 - y;
        cpx1 = x - (vx * lenPrevSeg) / lenNextSeg;
        cpy1 = y - (vy * lenPrevSeg) / lenNextSeg;
        cpx1 = Math.max(Math.min(cpx1, Math.max(prevX, x)), Math.min(prevX, x));
        cpy1 = Math.max(Math.min(cpy1, Math.max(prevY, y)), Math.min(prevY, y));
        vx = x - cpx1;
        vy = y - cpy1;
        nextCpx0 = x + (vx * lenNextSeg) / lenPrevSeg;
        nextCpy0 = y + (vy * lenNextSeg) / lenPrevSeg;
      }
      if (smooth > 0) d += `C${cpx0},${cpy0},${cpx1},${cpy1},${x},${y}`;
      else d += `L${x},${y}`;
      cpx0 = nextCpx0;
      cpy0 = nextCpy0;
    }
    prevX = x;
    prevY = y;
  }
  return d;
}

/** 컨테이너 폭(px) — 마운트 전(SSR)은 0이라 빈 칸(종전 echarts도 마운트 뒤 그렸다). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * 첫 표시 연출이 끝났는가 — 끝나면 연출 요소(클립 애니메이션·애니메이션 클래스)를 빼고 최종 그림만 남긴다.
 * 이유: '이미지로 저장'(html-to-image)이 DOM을 복제해 그릴 때 남아 있는 애니메이션이 처음부터 다시 돌아 선·막대가 빈 채로 찍힌다.
 */
export function useIntroDone(ready: boolean, ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready || done) return;
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ready, done, ms]);
  return done;
}

export type Grid = { left: number; right: number; top: number; bottom: number };
export type LegendItem = { name: string; color: string; on: boolean };

/** 범례(위 가운데) — echarts legend: 안쪽 여백 5, 아이콘 roundRect(반경 = 짧은 변/4), 아이콘-글자 5, 항목 간격 10. */
export function Legend({
  items, width, itemW, itemH, fontSize, onToggle,
}: {
  items: LegendItem[];
  width: number;
  itemW: number;
  itemH: number;
  fontSize: number;
  onToggle: (i: number) => void;
}) {
  const ws = items.map((it) => itemW + 5 + textWidth(it.name, fontSize));
  // 항목 사이 8px — echarts itemGap 10이지만 실제 그림(종전 차트 DOM 실측)은 8px 간격이다.
  const total = ws.reduce((a, b) => a + b, 0) + 8 * (items.length - 1);
  const rowH = Math.max(itemH, fontSize);
  const cy = 5 + rowH / 2;
  const start = (width - total) / 2;
  const xs = ws.map((_, i) => start + ws.slice(0, i).reduce((a, b) => a + b + 8, 0));
  const inactive = 'rgba(120,113,108,0.35)';
  return (
    <g>
      {items.map((it, i) => {
        const x0 = xs[i]!;
        return (
          <g key={it.name} onClick={() => onToggle(i)} style={{ cursor: 'pointer' }}>
            <rect x={x0 - 5} y={cy - rowH / 2 - 2} width={ws[i]! + 10} height={rowH + 4} fill="transparent" />
            <rect x={x0} y={cy - itemH / 2} width={itemW} height={itemH} rx={Math.min(itemW, itemH) / 4} fill={it.on ? it.color : inactive} />
            <text x={x0 + itemW + 5} y={cy} dominantBaseline="central" fontSize={fontSize} fontFamily={FONT} fill={it.on ? LABEL : inactive}>
              {it.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** 가로축(선 + 라벨) — 라벨은 축 아래 8px(echarts 'top' 기준선과 맞추려 SVG hanging에 +1px), 가운데 정렬. */
export function XAxis({ labels, xs, y, x0, x1, interval }: { labels: string[]; xs: number[]; y: number; x0: number; x1: number; interval: number }) {
  return (
    <g>
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={AXIS_LINE} strokeWidth={1} />
      {labels.map((l, i) =>
        i % (interval + 1) === 0 ? (
          <text key={i} x={xs[i]} y={y + 9} textAnchor="middle" dominantBaseline="hanging" fontSize={9} fontFamily={FONT} fill={LABEL}>
            {l}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** 세로 값 축 — 눈금마다 옅은 가로선 + 왼쪽 라벨(축에서 8px, 오른쪽 정렬). */
export function YAxis({ ticks, yOf, x0, x1, fmt }: { ticks: number[]; yOf: (v: number) => number; x0: number; x1: number; fmt: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={yOf(t)} y2={yOf(t)} stroke={SPLIT_LINE} strokeWidth={1} />
          <text x={x0 - 8} y={yOf(t)} textAnchor="end" dominantBaseline="central" fontSize={9} fontFamily={FONT} fill={LABEL}>
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** 가리킨 칸 점선(echarts axisPointer line: #b7b9be·1px·dashed 4 2). */
export function Pointer({ x, y0, y1 }: { x: number; y0: number; y1: number }) {
  return <line x1={x} x2={x} y1={y0} y2={y1} stroke={POINTER} strokeWidth={1} strokeDasharray="4 2" style={{ pointerEvents: 'none' }} />;
}

/** echarts 툴팁 마커(지름 10 원). */
export const marker = (color: string) =>
  `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`;

/**
 * 가리키기 상태 — 그리드 안에서 움직이거나(마우스) 누르면(터치) 그 칸을 잡고, 그리드를 벗어나면 0.1초 뒤 닫는다(echarts hideDelay 100).
 * 터치로 연 툴팁은 차트 밖을 누르면 닫힌다.
 */
export function useHover(grid: Grid, width: number, height: number, indexAt: (x: number) => number | null) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const update = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const inGrid = x >= grid.left && x <= width - grid.right && y >= grid.top && y <= height - grid.bottom;
    const i = inGrid ? indexAt(x) : null;
    if (i == null) {
      if (!hideRef.current) hideRef.current = setTimeout(() => setHover(null), 100);
      return;
    }
    if (hideRef.current) clearTimeout(hideRef.current);
    hideRef.current = null;
    setHover({ i, x, y });
  };
  const leave = () => {
    if (!hideRef.current) hideRef.current = setTimeout(() => setHover(null), 100);
  };
  useEffect(() => {
    if (!hover) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [hover]);
  useEffect(() => () => {
    if (hideRef.current) clearTimeout(hideRef.current);
  }, []);
  return { hover, boxRef, handlers: { onPointerMove: update, onPointerDown: update, onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && leave() } };
}

/** 툴팁 상자 — 커서 기준 +20(넘치면 반대쪽, 차트 크기 기준), 위치 이동은 0.4초 전환. */
export function Tooltip({ html, x, y, width, height }: { html: string; x: number; y: number; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // 처음 뜰 때는 그 자리에 바로 — 이동 전환은 그다음부터(echarts도 첫 표시는 미끄러지지 않는다).
  const [slide, setSlide] = useState(false);
  useEffect(() => {
    if (!pos || slide) return;
    const id = requestAnimationFrame(() => setSlide(true));
    return () => cancelAnimationFrame(id);
  }, [pos, slide]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const px = x + w + 20 + 2 > width ? x - w - 20 : x + 20;
    const py = y + h + 20 > height ? y - h - 20 : y + 20;
    setPos([Math.round(px), Math.round(py)]);
  }, [x, y, width, height, html]);
  return (
    <div
      ref={ref}
      // 내용은 날짜·숫자·고정 이름으로 만든 문자열뿐이다(사용자 입력 없음) — 종전 echarts formatter HTML과 같은 마크업.
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 30,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.4)',
        borderRadius: 4,
        backgroundColor: 'rgba(24,24,27,0.92)',
        boxShadow: '1px 2px 10px rgba(0, 0, 0, .2)',
        color: '#e4e4e7',
        font: `11px ${FONT}`,
        lineHeight: '17px',
        padding: 10,
        willChange: 'transform',
        transform: pos ? `translate3d(${pos[0]}px,${pos[1]}px,0)` : undefined,
        visibility: pos ? 'visible' : 'hidden',
        transition: slide ? 'opacity 0.2s cubic-bezier(0.23,1,0.32,1), visibility 0.2s cubic-bezier(0.23,1,0.32,1), transform 0.4s cubic-bezier(0.23,1,0.32,1)' : undefined,
      }}
    />
  );
}
