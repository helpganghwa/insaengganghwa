'use client';

import { useRef, useState } from 'react';

// 시계방향 회전 순서(아바타 변경 페이지와 동일).
const ROT_ORDER = [
  'south',
  'south_east',
  'east',
  'north_east',
  'north',
  'north_west',
  'west',
  'south_west',
] as const;

const DIR_LABEL: Record<string, string> = {
  south: '정면',
  south_east: '우측 앞',
  east: '우측',
  north_east: '우측 뒤',
  north: '뒷면',
  north_west: '좌측 뒤',
  west: '좌측',
  south_west: '좌측 앞',
};

const CHECKER = {
  backgroundImage:
    'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
} as const;

/**
 * 생성 내역 검토용 — 가로 꽉 채운 1:1 아바타 뷰어. 좌우 스와이프(드래그)로 8방향 회전.
 * 아바타 변경 페이지(ProfileSelector)와 동일한 turntable 방식. 일부 방향만 있는 건은
 * 존재하는 방향만 순회.
 */
export function AdminAvatarViewer({ rotations }: { rotations: Record<string, string> }) {
  const avail = ROT_ORDER.filter((d) => rotations[d]);
  const [idx, setIdx] = useState(0);
  const STEP = 34;
  const dragRef = useRef<{ startX: number; base: number } | null>(null);

  if (avail.length === 0) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-xl text-sm text-zinc-600"
        style={CHECKER}
      >
        이미지 없음
      </div>
    );
  }

  const n = avail.length;
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, base: idx };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const steps = Math.round(-(e.clientX - d.startX) / STEP);
    const ni = (((d.base + steps) % n) + n) % n;
    if (ni !== idx) setIdx(ni);
  };
  const end = () => {
    dragRef.current = null;
  };
  const curDir = avail[idx]!;

  return (
    <div>
      <div
        className="relative w-full cursor-grab touch-pan-y select-none overflow-hidden rounded-xl active:cursor-grabbing"
        style={{ aspectRatio: '1 / 1', ...CHECKER }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {avail.map((d, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={d}
            src={rotations[d]}
            alt={DIR_LABEL[d] ?? d}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ imageRendering: 'pixelated', opacity: i === idx ? 1 : 0 }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
        <span>← 밀어서 회전 →</span>
        <span className="font-bold text-zinc-300">{DIR_LABEL[curDir] ?? curDir}</span>
        <span className="tabular-nums">{idx + 1}/{n}</span>
      </div>
    </div>
  );
}
