'use client';

import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  attrDisplayVector,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

/**
 * 룬 이름·수치 표기(2026-07-28 확정 UI) — 이름이 곧 비주얼:
 *  - 그라데이션 구간 폭 = 지역 수치 비중(내림차순)
 *  - 채도 = 수치 크기(color-mix, 50=순색·낮을수록 회색으로 바램) → 저총합 룬은 잿빛 이름
 *  - 몰빵(단일 지역)은 순색 + 밝은 하이라이트(등급 명명 없이 시각 강도만)
 */

const GRAY = '#8a8a93';

/** 합산 벡터 내림차순 [지역, 표기값][] — 0 제외. */
export function runeVectorDesc(attrs: AvatarAttr[]): [AttrRegion, number][] {
  return (Object.entries(attrDisplayVector(attrs)) as [AttrRegion, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

export function runeNameGradient(attrs: AvatarAttr[]): string {
  const entries = runeVectorDesc(attrs);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return `linear-gradient(90deg, #6b6b73, #56565e)`;
  const sat = (v: number) => Math.min(100, v * 2); // 50 = 순색
  if (entries.length === 1) {
    const [r, v] = entries[0]!;
    const c = `color-mix(in srgb, ${ATTR_REGION_COLOR[r]} ${sat(v)}%, ${GRAY})`;
    const hi = `color-mix(in srgb, ${c} 55%, white)`;
    return `linear-gradient(90deg, ${c}, ${hi} 55%, ${c})`;
  }
  const stops: string[] = [];
  let acc = 0;
  for (const [r, v] of entries) {
    const from = (acc / total) * 100;
    acc += v;
    const to = (acc / total) * 100;
    const c = `color-mix(in srgb, ${ATTR_REGION_COLOR[r]} ${sat(v)}%, ${GRAY})`;
    stops.push(`${c} ${from.toFixed(1)}% ${to.toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** 그라데이션 룬 이름 — 폰트 크기·굵기는 className으로. */
export function RuneName({
  name,
  attrs,
  className = '',
}: {
  name: string | null;
  attrs: AvatarAttr[];
  className?: string;
}) {
  return (
    <span
      className={`min-w-0 truncate bg-clip-text font-extrabold text-transparent ${className}`}
      style={{ backgroundImage: runeNameGradient(attrs) }}
    >
      {name ?? '이름 없는 룬'}
    </span>
  );
}

/** 지역 수치 줄 — 지역색 그대로(가독성 우선, dim 없음). 0 지역 미표시. */
export function RuneValues({ attrs, className = '' }: { attrs: AvatarAttr[]; className?: string }) {
  const entries = runeVectorDesc(attrs);
  if (entries.length === 0) {
    return <span className={`text-zinc-500 ${className}`}>속성 없음</span>;
  }
  return (
    <span className={`flex flex-wrap gap-x-2.5 font-mono font-semibold tabular-nums ${className}`}>
      {entries.map(([r, v]) => (
        <span key={r} style={{ color: ATTR_REGION_COLOR[r] }}>
          {ATTR_REGION_KO[r]} {v}
        </span>
      ))}
    </span>
  );
}
