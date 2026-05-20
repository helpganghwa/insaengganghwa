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

// 01 Filigree Curl — Diablo/판타지 식물 덩굴 곡선 + 끝 구슬
const V1_FiligreeCurl = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <path
        d="M 2 2 Q 6 2.5 8 5 Q 10 7.5 8 10 Q 6 12 3 11"
        stroke={color}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M 6 5 Q 8 6 9 8" stroke={accent} strokeWidth="0.7" fill="none" strokeLinecap="round" />
      <circle cx="2" cy="2" r="1.5" fill={color} />
      <circle cx="2" cy="2" r="0.7" fill="rgba(255,255,255,0.95)" />
      <circle cx="11" cy="9" r="1.1" fill={accent} />
      <circle cx="4" cy="13" r="0.85" fill={accent} />
    </>,
  );

// 02 Heraldic Diamond — 왕가 톤. 큰 다이아 + 양쪽 휠
const V2_HeraldicDiamond = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="2.5" y="2.5" width="6" height="6" fill={color} transform="rotate(45 5.5 5.5)" />
      <rect x="3.8" y="3.8" width="3.4" height="3.4" fill={accent} transform="rotate(45 5.5 5.5)" />
      <circle cx="5.5" cy="5.5" r="0.9" fill="rgba(255,255,255,0.95)" />
      <circle cx="12" cy="3" r="1.8" fill="none" stroke={color} strokeWidth="0.9" />
      <circle cx="12" cy="3" r="0.7" fill={accent} />
      <circle cx="3" cy="12" r="1.8" fill="none" stroke={color} strokeWidth="0.9" />
      <circle cx="3" cy="12" r="0.7" fill={accent} />
      <line x1="9" y1="5.5" x2="11" y2="3.7" stroke={color} strokeWidth="0.6" />
      <line x1="5.5" y1="9" x2="3.7" y2="11" stroke={color} strokeWidth="0.6" />
    </>,
  );

// 03 Celtic Knot — interlace 4-loop 매듭(켈틱 톤)
const V3_CelticKnot = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M 3 1 Q 3 6 8 6 Q 11 6 11 3" />
        <path d="M 1 3 Q 6 3 6 8 Q 6 11 3 11" />
        <path d="M 11 3 Q 13 3 14 5" />
        <path d="M 3 11 Q 3 13 5 14" />
      </g>
      <circle cx="6" cy="6" r="1.7" fill={accent} />
      <circle cx="6" cy="6" r="0.8" fill="rgba(255,255,255,0.95)" />
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

// 05 Greek Meander — 그리스 키 미로 패턴(직각 굴절)
const V5_GreekMeander = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g stroke={color} strokeWidth="1.4" fill="none" strokeLinejoin="miter">
        <path d="M 0 3 L 7 3 L 7 0" />
        <path d="M 0 6 L 4 6 L 4 9 L 0 9" />
        <path d="M 10 0 L 10 6 L 13 6 L 13 0" />
      </g>
      <g fill={accent}>
        <circle cx="0" cy="0" r="1.2" />
        <circle cx="14" cy="8" r="0.85" />
        <circle cx="6" cy="13" r="0.85" />
      </g>
    </>,
  );

// 06 Crystal Shard — 다이아블로 II rare item 톤. 큰 크리스탈 + 위성
const V6_CrystalShard = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <polygon points="6,1 10,5 6,10 2,5" fill={color} />
      <line x1="6" y1="1" x2="6" y2="10" stroke={accent} strokeWidth="0.5" />
      <line x1="2" y1="5" x2="10" y2="5" stroke={accent} strokeWidth="0.5" />
      <polygon points="13,3 15,5 13,7 11,5" fill={accent} />
      <polygon points="3,12 5,14 3,16 1,14" fill={accent} />
      <circle cx="6" cy="5.5" r="0.95" fill="rgba(255,255,255,0.92)" />
    </>,
  );

// 07 Beaded Filigree — 곡선 + 대-중-소 구슬 줄(Hearthstone tooltip 톤)
const V7_BeadedFiligree = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <path
        d="M 1.5 1.5 Q 5 4 9 9 Q 11 11.5 14 14"
        stroke={color}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="1.5" cy="1.5" r="1.6" fill={color} />
      <circle cx="1.5" cy="1.5" r="0.7" fill="rgba(255,255,255,0.95)" />
      <circle cx="5" cy="4" r="0.95" fill={accent} />
      <circle cx="9" cy="9" r="1.3" fill={color} />
      <circle cx="9" cy="9" r="0.55" fill="rgba(255,255,255,0.85)" />
      <circle cx="11.5" cy="11.5" r="0.75" fill={accent} />
      <circle cx="14" cy="14" r="0.55" fill={accent} />
    </>,
  );

// 08 Art Deco Steps — 계단형 대칭 기하(Stardew·art deco)
const V8_ArtDecoSteps = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="0" y="0" width="11" height="2" fill={color} />
      <rect x="0" y="0" width="2" height="11" fill={color} />
      <rect x="3" y="3" width="6" height="1.5" fill={accent} />
      <rect x="3" y="3" width="1.5" height="6" fill={accent} />
      <rect x="5.5" y="5.5" width="3" height="1" fill={color} />
      <rect x="5.5" y="5.5" width="1" height="3" fill={color} />
      <circle cx="11.5" cy="1" r="0.95" fill={accent} />
      <circle cx="1" cy="11.5" r="0.95" fill={accent} />
    </>,
  );

// 09 Sun Burst Royal — 8광선 + 중앙 보석(FF·Octopath)
const V9_SunBurstRoyal = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <g stroke={color} strokeWidth="1" strokeLinecap="round">
        <line x1="6" y1="6" x2="0" y2="0" />
        <line x1="6" y1="6" x2="6" y2="0" />
        <line x1="6" y1="6" x2="0" y2="6" />
        <line x1="6" y1="6" x2="13" y2="0" />
        <line x1="6" y1="6" x2="0" y2="13" />
        <line x1="6" y1="6" x2="14" y2="6" />
        <line x1="6" y1="6" x2="6" y2="14" />
        <line x1="6" y1="6" x2="13" y2="13" />
      </g>
      <g stroke={accent} strokeWidth="0.5" strokeLinecap="round">
        <line x1="6" y1="6" x2="10" y2="2" />
        <line x1="6" y1="6" x2="2" y2="10" />
        <line x1="6" y1="6" x2="11" y2="11" />
      </g>
      <circle cx="6" cy="6" r="2.5" fill={color} />
      <circle cx="6" cy="6" r="1.4" fill={accent} />
      <circle cx="6" cy="6" r="0.6" fill="rgba(255,255,255,0.95)" />
    </>,
  );

// 10 Mosaic Tile — 픽셀 사각형 모자이크(Stardew·8bit)
const V10_MosaicTile = ({ color, accent }: OrnateProps) =>
  wrap(
    <>
      <rect x="0" y="0" width="3.5" height="3.5" fill={color} />
      <rect x="4" y="0" width="2.5" height="2.5" fill={accent} />
      <rect x="0" y="4" width="2.5" height="2.5" fill={accent} />
      <rect x="3.5" y="3.5" width="3" height="3" fill={color} />
      <rect x="7" y="0" width="2" height="2" fill={accent} />
      <rect x="0" y="7" width="2" height="2" fill={accent} />
      <rect x="7" y="3.5" width="2" height="2" fill={color} />
      <rect x="3.5" y="7" width="2" height="2" fill={color} />
      <rect x="10" y="2" width="1.5" height="1.5" fill={accent} />
      <rect x="2" y="10" width="1.5" height="1.5" fill={accent} />
      <rect x="6.5" y="6.5" width="1.5" height="1.5" fill={accent} />
    </>,
  );

const VARIANTS: { key: string; label: string; sub: string; Comp: (p: OrnateProps) => React.ReactElement }[] = [
  { key: 'V1', label: '01. Filigree Curl', sub: '식물 덩굴 곡선 + 구슬 (Diablo)', Comp: V1_FiligreeCurl },
  { key: 'V2', label: '02. Heraldic Diamond', sub: '왕가 다이아 + 양쪽 휠', Comp: V2_HeraldicDiamond },
  { key: 'V3', label: '03. Celtic Knot', sub: '켈틱 4-loop interlace', Comp: V3_CelticKnot },
  { key: 'V4', label: '04. Star Trio (유지)', sub: '큰 별 + 위성 별 3', Comp: V4_StarTrio },
  { key: 'V5', label: '05. Greek Meander', sub: '그리스 키 미로 + 점', Comp: V5_GreekMeander },
  { key: 'V6', label: '06. Crystal Shard', sub: '크리스탈 + 위성 (Diablo II)', Comp: V6_CrystalShard },
  { key: 'V7', label: '07. Beaded Filigree', sub: '곡선 + 대-중-소 구슬', Comp: V7_BeadedFiligree },
  { key: 'V8', label: '08. Art Deco Steps', sub: '계단형 대칭 기하', Comp: V8_ArtDecoSteps },
  { key: 'V9', label: '09. Sun Burst Royal', sub: '8광선 + 중앙 보석 (FF)', Comp: V9_SunBurstRoyal },
  { key: 'V10', label: '10. Mosaic Tile', sub: '픽셀 모자이크 (Stardew)', Comp: V10_MosaicTile },
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
