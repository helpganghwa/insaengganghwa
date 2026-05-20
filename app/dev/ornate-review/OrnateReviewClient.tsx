'use client';

import { useState } from 'react';

import { TranscendSprite } from '@/components/TranscendSprite';
import { transcendStyle } from '@/lib/game/equipment/transcend';

export interface SpriteEntry {
  code: string;
  path: string;
  slot: 'weapon' | 'armor' | 'accessory';
}

// ─────────────────────────────────────────────────────────────────────
// 10 ornate variants — 둥근 모서리 친화(코너 점/별/픽셀 위주, L 라인 배제)
// 좌상단 기준 SVG. 4방향 transform-flip 재사용. viewBox 0 0 30 30.
// ─────────────────────────────────────────────────────────────────────

type OrnateProps = { color: string; accent: string };
const wrap = (children: React.ReactNode) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} shapeRendering="crispEdges">
    {children}
  </svg>
);

// 01 Pixel Stair v2 — 굵은 계단(8번 강화). 끝에 다이아 보석.
const V1_PixelStair = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="0" y="0" width="16" height="3" fill={color} />
      <rect x="0" y="3" width="13" height="3" fill={color} />
      <rect x="0" y="6" width="10" height="3" fill={color} />
      <rect x="0" y="9" width="7" height="3" fill={color} />
      <rect x="0" y="12" width="4" height="4" fill={color} />
      <rect x="14" y="-0.5" width="3.5" height="3.5" fill={accent} transform="rotate(45 15.75 1.25)" />
      <rect x="-0.5" y="14" width="3.5" height="3.5" fill={accent} transform="rotate(45 1.25 15.75)" />
    </>,
  );

// 02 Pixel Diagonal — 대각선 픽셀 5점 + 끝점 큰 다이아
const V2_PixelDiagonal = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="2" y="2" width="3.5" height="3.5" fill={color} />
      <rect x="5.5" y="5.5" width="3" height="3" fill={color} />
      <rect x="8.5" y="8.5" width="2.5" height="2.5" fill={color} />
      <rect x="11" y="11" width="2" height="2" fill={color} />
      <rect x="1" y="1" width="2.5" height="2.5" fill={accent} transform="rotate(45 2.25 2.25)" />
    </>,
  );

// 03 Star Burst v2 — 큰 별 + 광선 5개(굵게·디테일)
const V3_StarBurst = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g stroke={accent} strokeWidth="1.2" strokeLinecap="round">
        <line x1="5" y1="5" x2="15" y2="1" />
        <line x1="5" y1="5" x2="15" y2="15" />
        <line x1="5" y1="5" x2="1" y2="15" />
        <line x1="5" y1="5" x2="11" y2="0" />
        <line x1="5" y1="5" x2="0" y2="11" />
      </g>
      <g transform="translate(5 5)" fill={color}>
        <polygon points="0,-5 1.4,-1.4 5,0 1.4,1.4 0,5 -1.4,1.4 -5,0 -1.4,-1.4" />
      </g>
      <circle cx="5" cy="5" r="1.7" fill="rgba(255,255,255,0.95)" />
    </>,
  );

// 04 Star Trio — 큰 별 + 작은 별 3개 위성
const V4_StarTrio = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g transform="translate(6 6)" fill={color}>
        <polygon points="0,-4 1.1,-1.1 4,0 1.1,1.1 0,4 -1.1,1.1 -4,0 -1.1,-1.1" />
      </g>
      <g transform="translate(13 3)" fill={accent}>
        <polygon points="0,-2 0.55,-0.55 2,0 0.55,0.55 0,2 -0.55,0.55 -2,0 -0.55,-0.55" />
      </g>
      <g transform="translate(3 13)" fill={accent}>
        <polygon points="0,-2 0.55,-0.55 2,0 0.55,0.55 0,2 -0.55,0.55 -2,0 -0.55,-0.55" />
      </g>
      <g transform="translate(12 12)" fill={accent}>
        <polygon points="0,-1.6 0.45,-0.45 1.6,0 0.45,0.45 0,1.6 -0.45,0.45 -1.6,0 -0.45,-0.45" />
      </g>
      <circle cx="6" cy="6" r="1.1" fill="rgba(255,255,255,0.9)" />
    </>,
  );

// 05 Gem Cluster — 다이아 3개 클러스터(큰 + 작은 2)
const V5_GemCluster = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="3" y="3" width="5" height="5" fill={color} transform="rotate(45 5.5 5.5)" />
      <rect x="11" y="3" width="3" height="3" fill={accent} transform="rotate(45 12.5 4.5)" />
      <rect x="3" y="11" width="3" height="3" fill={accent} transform="rotate(45 4.5 12.5)" />
      <circle cx="5.5" cy="5.5" r="0.9" fill="rgba(255,255,255,0.85)" />
    </>,
  );

// 06 Sparkle Dots — 큰 별 + 흩어진 점 5
const V6_SparkleDots = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g transform="translate(5 5)" fill={color}>
        <polygon points="0,-4.5 1.25,-1.25 4.5,0 1.25,1.25 0,4.5 -1.25,1.25 -4.5,0 -1.25,-1.25" />
      </g>
      <circle cx="5" cy="5" r="1.3" fill="rgba(255,255,255,0.92)" />
      <g fill={accent}>
        <circle cx="13" cy="2" r="0.95" />
        <circle cx="2" cy="13" r="0.95" />
        <circle cx="14" cy="9" r="0.7" />
        <circle cx="9" cy="14" r="0.7" />
        <circle cx="11" cy="11" r="0.55" />
      </g>
    </>,
  );

// 07 Pixel Crown — 8bit 작은 왕관(3 spike + 보석점)
const V7_PixelCrown = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="2" y="7" width="13" height="2.5" fill={color} />
      <rect x="2" y="9.5" width="13" height="1" fill={accent} />
      <rect x="2" y="4" width="2.5" height="3" fill={color} />
      <rect x="7.25" y="2.5" width="2.5" height="4.5" fill={color} />
      <rect x="12.5" y="4" width="2.5" height="3" fill={color} />
      <circle cx="3.25" cy="3" r="0.85" fill={accent} />
      <circle cx="8.5" cy="1.5" r="0.95" fill={accent} />
      <circle cx="13.75" cy="3" r="0.85" fill={accent} />
    </>,
  );

// 08 Diamond Pyramid — 큰 다이아 1 + 작은 다이아 2 대각 배치
const V8_DiamondPyramid = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="1.5" y="1.5" width="6" height="6" fill={color} transform="rotate(45 4.5 4.5)" />
      <rect x="10" y="3" width="3" height="3" fill={accent} transform="rotate(45 11.5 4.5)" />
      <rect x="3" y="10" width="3" height="3" fill={accent} transform="rotate(45 4.5 11.5)" />
      <rect x="11" y="11" width="2.5" height="2.5" fill={color} transform="rotate(45 12.25 12.25)" />
      <circle cx="4.5" cy="4.5" r="1.2" fill="rgba(255,255,255,0.92)" />
    </>,
  );

// 09 Burst Rays — 작은 별 + 6 광선(긴·짧음 교차)
const V9_BurstRays = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g stroke={color} strokeWidth="1.4" strokeLinecap="round">
        <line x1="5" y1="5" x2="16" y2="0" />
        <line x1="5" y1="5" x2="16" y2="16" />
        <line x1="5" y1="5" x2="0" y2="16" />
      </g>
      <g stroke={accent} strokeWidth="0.85" strokeLinecap="round">
        <line x1="5" y1="5" x2="13" y2="2" />
        <line x1="5" y1="5" x2="13" y2="13" />
        <line x1="5" y1="5" x2="2" y2="13" />
      </g>
      <g transform="translate(5 5)" fill={color}>
        <polygon points="0,-3 0.85,-0.85 3,0 0.85,0.85 0,3 -0.85,0.85 -3,0 -0.85,-0.85" />
      </g>
      <circle cx="5" cy="5" r="0.9" fill="rgba(255,255,255,0.95)" />
    </>,
  );

// 10 Rune Cross — 룬 십자 + 점 5
const V10_RuneCross = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="4" y="2" width="2.5" height="8" fill={color} />
      <rect x="1.25" y="4.75" width="8" height="2.5" fill={color} />
      <circle cx="5.25" cy="6" r="0.85" fill="rgba(255,255,255,0.95)" />
      <g fill={accent}>
        <circle cx="12" cy="2.5" r="0.95" />
        <circle cx="2.5" cy="12" r="0.95" />
        <circle cx="12" cy="12" r="0.85" />
        <circle cx="14" cy="7" r="0.65" />
        <circle cx="7" cy="14" r="0.65" />
      </g>
    </>,
  );

const VARIANTS: { key: string; label: string; sub: string; Comp: (p: OrnateProps) => React.ReactElement }[] = [
  { key: 'V1', label: '01. Pixel Stair', sub: '굵은 5단 계단 + 끝 다이아', Comp: V1_PixelStair },
  { key: 'V2', label: '02. Pixel Diagonal', sub: '대각선 픽셀 5점', Comp: V2_PixelDiagonal },
  { key: 'V3', label: '03. Star Burst', sub: '큰 별 + 5 광선', Comp: V3_StarBurst },
  { key: 'V4', label: '04. Star Trio', sub: '큰 별 + 위성 별 3', Comp: V4_StarTrio },
  { key: 'V5', label: '05. Gem Cluster', sub: '다이아 3 클러스터', Comp: V5_GemCluster },
  { key: 'V6', label: '06. Sparkle Dots', sub: '큰 별 + 점 5', Comp: V6_SparkleDots },
  { key: 'V7', label: '07. Pixel Crown', sub: '8bit 왕관 + 보석점', Comp: V7_PixelCrown },
  { key: 'V8', label: '08. Diamond Pyramid', sub: '다이아 4 단계 배치', Comp: V8_DiamondPyramid },
  { key: 'V9', label: '09. Burst Rays', sub: '별 + 광선 6(긴/짧음)', Comp: V9_BurstRays },
  { key: 'V10', label: '10. Rune Cross', sub: '룬 십자 + 점 5', Comp: V10_RuneCross },
];

function PreviewCard({
  variant,
  level,
  sprite,
}: {
  variant: (typeof VARIANTS)[number];
  level: number;
  sprite: SpriteEntry;
}) {
  const st = transcendStyle(level);
  const [r, g, b] = st.colorRgb;
  const color = `rgb(${r},${g},${b})`;
  const accent = `rgb(${Math.round(r + (255 - r) * 0.45)},${Math.round(g + (255 - g) * 0.45)},${Math.round(b + (255 - b) * 0.45)})`;
  const corners: { pos: React.CSSProperties; transform: string }[] = [
    { pos: { top: 0, left: 0 }, transform: 'none' },
    { pos: { top: 0, right: 0 }, transform: 'scaleX(-1)' },
    { pos: { bottom: 0, left: 0 }, transform: 'scaleY(-1)' },
    { pos: { bottom: 0, right: 0 }, transform: 'scale(-1, -1)' },
  ];
  const Ornate = variant.Comp;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 border-zinc-200 bg-white px-1 text-center dark:border-zinc-800 dark:bg-zinc-950"
        style={{ minWidth: 120, maxWidth: 140 }}
      >
        {st.hasFrame ? (
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {corners.map((c, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: '30%',
                  height: '30%',
                  transform: c.transform,
                  ...c.pos,
                }}
              >
                <Ornate color={color} accent={accent} />
              </div>
            ))}
          </div>
        ) : null}
        <TranscendSprite code={sprite.code} slot={sprite.slot} level={level} size={64} frameless />
        <span className="line-clamp-1 px-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
          {sprite.code.replace(/_/g, ' ')}
        </span>
        <span className="text-xs font-semibold">+15</span>
      </div>
      <div className="text-center text-[10px] leading-tight">
        <div className="font-mono font-semibold text-zinc-300">{variant.label}</div>
        <div className="text-zinc-500">{variant.sub}</div>
      </div>
    </div>
  );
}

const LEVELS = [
  { v: 2, label: '+2 일반' },
  { v: 4, label: '+4 희귀' },
  { v: 6, label: '+6 영웅' },
  { v: 8, label: '+8 전설' },
  { v: 10, label: '+10 신화' },
] as const;

export function OrnateReviewClient({ sprites }: { sprites: SpriteEntry[] }) {
  const [level, setLevel] = useState<number>(6);
  const [spriteIdx, setSpriteIdx] = useState(0);
  const sprite = sprites[spriteIdx] ?? sprites[0]!;
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 text-zinc-100">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-semibold">코너 ornate 10가지 — v2 (L 잘림 회피, 디테일 강화)</h1>
        <p className="mt-1 text-xs text-zinc-400">
          모두 코너 모티프 위주 — 둥근 모서리에 자연. 등급/sprite 변경하며 비교.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">등급:</span>
            {LEVELS.map((l) => (
              <button
                key={l.v}
                onClick={() => setLevel(l.v)}
                className={`rounded px-2 py-0.5 font-mono ${
                  level === l.v
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">sprite:</span>
            <button
              onClick={() => setSpriteIdx((i) => (i - 1 + sprites.length) % sprites.length)}
              className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700"
            >
              ◀
            </button>
            <span className="min-w-[10rem] font-mono text-zinc-300">{sprite.code}</span>
            <button
              onClick={() => setSpriteIdx((i) => (i + 1) % sprites.length)}
              className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700"
            >
              ▶
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {VARIANTS.map((v) => (
          <PreviewCard key={v.key} variant={v} level={level} sprite={sprite} />
        ))}
      </div>
    </div>
  );
}
