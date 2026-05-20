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
// 10 ornate variants — 모두 좌상단 기준 SVG. 4 방향은 transform-flip으로 재사용.
// viewBox 0 0 30 30 (카드 30% 영역에 그려짐).
// ─────────────────────────────────────────────────────────────────────

type OrnateProps = { color: string; accent: string };

const V1_ClassicL = ({ color, accent }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <rect x="0" y="0" width="22" height="3" fill={color} />
    <rect x="0" y="0" width="3" height="22" fill={color} />
    <rect x="19.5" y="-1" width="4" height="4" fill={color} transform="rotate(45 21.5 1)" />
    <rect x="-1" y="19.5" width="4" height="4" fill={color} transform="rotate(45 1 21.5)" />
    <circle cx="7" cy="7" r="1.8" fill={accent} />
  </svg>
);

const V2_MinimalL = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <rect x="0" y="0" width="18" height="2" fill={color} />
    <rect x="0" y="0" width="2" height="18" fill={color} />
  </svg>
);

const V3_ArrowL = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <rect x="0" y="0" width="20" height="3" fill={color} />
    <rect x="0" y="0" width="3" height="20" fill={color} />
    <polygon points="20,0 26,1.5 20,3" fill={color} />
    <polygon points="0,20 1.5,26 3,20" fill={color} />
  </svg>
);

const V4_StarL = ({ color, accent }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <rect x="0" y="0" width="20" height="2.5" fill={color} />
    <rect x="0" y="0" width="2.5" height="20" fill={color} />
    <g transform="translate(20.5 1.25)" fill={accent}>
      <polygon points="0,-2.5 0.7,-0.7 2.5,0 0.7,0.7 0,2.5 -0.7,0.7 -2.5,0 -0.7,-0.7" />
    </g>
    <g transform="translate(1.25 20.5)" fill={accent}>
      <polygon points="0,-2.5 0.7,-0.7 2.5,0 0.7,0.7 0,2.5 -0.7,0.7 -2.5,0 -0.7,-0.7" />
    </g>
  </svg>
);

const V5_DoubleL = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <rect x="0" y="0" width="22" height="2" fill={color} />
    <rect x="0" y="0" width="2" height="22" fill={color} />
    <rect x="4" y="4" width="14" height="1.5" fill={color} />
    <rect x="4" y="4" width="1.5" height="14" fill={color} />
  </svg>
);

const V6_CurveL = ({ color, accent }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    {/* 90° 호 — 좌상 안쪽에서 시작해 외곽으로 휨 */}
    <path d="M 22 0 L 0 0 L 0 22" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M 18 4 Q 4 4, 4 18" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </svg>
);

const V7_TriangleRing = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    <defs>
      <mask id="triHole">
        <rect width="30" height="30" fill="white" />
        <polygon points="4,4 16,4 4,16" fill="black" />
      </mask>
    </defs>
    <polygon points="0,0 22,0 0,22" fill={color} mask="url(#triHole)" />
  </svg>
);

const V8_PixelStair = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} shapeRendering="crispEdges">
    {/* 계단형 8bit 픽셀 */}
    <rect x="0" y="0" width="14" height="3" fill={color} />
    <rect x="0" y="3" width="11" height="3" fill={color} />
    <rect x="0" y="6" width="8" height="3" fill={color} />
    <rect x="0" y="9" width="6" height="3" fill={color} />
    <rect x="0" y="12" width="3" height="6" fill={color} />
    <rect x="3" y="9" width="3" height="3" fill={color} />
    <rect x="6" y="6" width="2" height="3" fill={color} />
    <rect x="8" y="3" width="3" height="3" fill={color} />
    <rect x="11" y="0" width="3" height="3" fill={color} />
  </svg>
);

const V9_Bracket = ({ color }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    {/* 두꺼운 ㄴ 브래킷 */}
    <rect x="0" y="0" width="14" height="4" fill={color} />
    <rect x="0" y="0" width="4" height="14" fill={color} />
    <rect x="14" y="0" width="2" height="2" fill={color} />
    <rect x="0" y="14" width="2" height="2" fill={color} />
  </svg>
);

const V10_StarBurst = ({ color, accent }: OrnateProps) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
    {/* 모서리 외각 광선 — 8각 별 + 짧은 광선 */}
    <g transform="translate(4 4)" fill={color}>
      <polygon points="0,-4 1.1,-1.1 4,0 1.1,1.1 0,4 -1.1,1.1 -4,0 -1.1,-1.1" />
    </g>
    <g stroke={accent} strokeWidth="0.7" strokeLinecap="round">
      <line x1="4" y1="4" x2="12" y2="0.5" />
      <line x1="4" y1="4" x2="0.5" y2="12" />
      <line x1="4" y1="4" x2="11" y2="11" />
    </g>
    <circle cx="4" cy="4" r="1.2" fill="rgba(255,255,255,0.92)" />
  </svg>
);

const VARIANTS: { key: string; label: string; sub: string; Comp: (p: OrnateProps) => React.ReactElement }[] = [
  { key: 'V1', label: '01. Classic L', sub: 'L + 다이아 + 점(현재)', Comp: V1_ClassicL },
  { key: 'V2', label: '02. Minimal L', sub: 'L 라인만', Comp: V2_MinimalL },
  { key: 'V3', label: '03. Arrow L', sub: 'L + 끝 화살표', Comp: V3_ArrowL },
  { key: 'V4', label: '04. Star L', sub: 'L + 끝 별', Comp: V4_StarL },
  { key: 'V5', label: '05. Double L', sub: '평행 두 L', Comp: V5_DoubleL },
  { key: 'V6', label: '06. Curve L', sub: '외각 직선 + 안쪽 곡선', Comp: V6_CurveL },
  { key: 'V7', label: '07. Triangle Wedge', sub: '삼각 ring(mask hole)', Comp: V7_TriangleRing },
  { key: 'V8', label: '08. Pixel Stair', sub: '계단형 8bit', Comp: V8_PixelStair },
  { key: 'V9', label: '09. Bracket', sub: '두꺼운 ㄴ 브래킷', Comp: V9_Bracket },
  { key: 'V10', label: '10. Star Burst', sub: '코너 별 + 광선', Comp: V10_StarBurst },
];

// 카드 미리보기 — 인벤토리 Tile 모방
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
        <h1 className="text-base font-semibold">코너 ornate 10가지 비교</h1>
        <p className="mt-1 text-xs text-zinc-400">
          같은 sprite·등급에서 10 변형을 나란히. 등급/sprite 변경하며 결정하세요.
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
