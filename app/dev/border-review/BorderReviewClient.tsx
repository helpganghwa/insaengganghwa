'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

export interface SpriteEntry {
  code: string;
  path: string;
  slot: 'weapon' | 'armor' | 'accessory';
}

type OptionKey = 'A' | 'B' | 'C' | 'D';
const OPTIONS: { key: OptionKey; title: string; sub: string }[] = [
  { key: 'A', title: '현재', sub: 'baseline (sprite 52%·frame 100%)' },
  { key: 'B', title: 'Frame 생략 + 외곽선 tint', sub: 'sprite 가장자리 1~2px만 등급색' },
  { key: 'C', title: 'Sprite 크게(82%)', sub: 'frame이 자체 보더 위 덮음' },
  { key: 'D', title: '간격 확대(40%)', sub: '두 줄 명확 분리(의도 디자인)' },
];

const LEVELS = [
  { v: 2, label: '+2 일반' },
  { v: 4, label: '+4 희귀' },
  { v: 6, label: '+6 영웅' },
  { v: 8, label: '+8 전설' },
  { v: 10, label: '+10 신화' },
] as const;

const SLOTS = [
  { v: 'all', label: '전체' },
  { v: 'weapon', label: '무기' },
  { v: 'armor', label: '방어구' },
  { v: 'accessory', label: '장신구' },
] as const;

// ── 외곽선 강도 분석 (외곽 1px 링의 어두운 불투명 비율) ──
async function detectEdgeStrength(path: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(0);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = c.getContext('2d');
        if (!x) return resolve(0);
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let total = 0;
        let dark = 0;
        const sample = (px: number, py: number) => {
          total++;
          const i = (py * c.width + px) * 4;
          const a = d[i + 3]!;
          if (a < 16) return;
          const r = d[i]!,
            g = d[i + 1]!,
            b = d[i + 2]!;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum < 0.4) dark++;
        };
        for (let p = 0; p < c.width; p++) {
          sample(p, 0);
          sample(p, c.height - 1);
        }
        for (let p = 1; p < c.height - 1; p++) {
          sample(0, p);
          sample(c.width - 1, p);
        }
        resolve(total === 0 ? 0 : dark / total);
      } catch {
        resolve(0);
      }
    };
    img.src = path;
  });
}

// 옵션 B 트릭: sprite shape을 등급색으로 칠한 레이어 + 그 위에 살짝 작게(원본) 덮음
// → 가장자리 1~2px만 등급색 ring (자체 보더가 있으면 그 자리가 등급색이 됨).
function OptionB({ sprite, color, size, sub }: { sprite: string; color: string; size: number; sub: 0 | 1 | null }) {
  const sw = size * 0.82; // sprite 영역 크게
  const inset = size * 0.115;
  const starBox = size * 0.16;
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      {/* 등급색 sprite-shape 레이어 */}
      <div
        style={{
          position: 'absolute',
          left: (size - sw) / 2,
          top: (size - sw) / 2,
          width: sw,
          height: sw,
          backgroundColor: color,
          WebkitMaskImage: `url(${sprite})`,
          maskImage: `url(${sprite})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
      {/* 원본 sprite, 살짝 inset → 외곽 ring 1.5px만 등급색으로 보임 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sprite}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: (size - sw) / 2 + 1.5,
          top: (size - sw) / 2 + 1.5,
          width: sw - 3,
          height: sw - 3,
          imageRendering: 'pixelated',
        }}
      />
      {/* II 코너 별 (sub=1) */}
      {sub === 1
        ? ([
            [inset, inset],
            [size - inset, inset],
            [inset, size - inset],
            [size - inset, size - inset],
          ] as const).map(([cx, cy], i) => (
            <svg
              key={i}
              aria-hidden
              width={starBox}
              height={starBox}
              viewBox={`0 0 ${starBox} ${starBox}`}
              style={{ position: 'absolute', left: cx - starBox / 2, top: cy - starBox / 2 }}
            >
              <polygon points={starPoints(starBox / 2)} fill={color} />
              <circle cx={starBox / 2} cy={starBox / 2} r={starBox * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))
        : null}
    </div>
  );
}

// 옵션 A/C/D 공통: sprite 크기만 다름. frame은 size 전체 mask 그대로.
function OptionAFrame({
  sprite,
  color,
  size,
  sub,
  spritePct,
}: {
  sprite: string;
  color: string;
  size: number;
  sub: 0 | 1 | null;
  spritePct: number;
}) {
  const sw = size * spritePct;
  const inset = size * 0.115;
  const starBox = size * 0.16;
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sprite}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: (size - sw) / 2,
          top: (size - sw) / 2,
          width: sw,
          height: sw,
          imageRendering: 'pixelated',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color,
          WebkitMaskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          maskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
      {sub === 1
        ? ([
            [inset, inset],
            [size - inset, inset],
            [inset, size - inset],
            [size - inset, size - inset],
          ] as const).map(([cx, cy], i) => (
            <svg
              key={i}
              aria-hidden
              width={starBox}
              height={starBox}
              viewBox={`0 0 ${starBox} ${starBox}`}
              style={{ position: 'absolute', left: cx - starBox / 2, top: cy - starBox / 2 }}
            >
              <polygon points={starPoints(starBox / 2)} fill={color} />
              <circle cx={starBox / 2} cy={starBox / 2} r={starBox * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))
        : null}
    </div>
  );
}

function starPoints(R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? R : R * 0.4;
    const a = (i * 45 - 90) * (Math.PI / 180);
    pts.push(`${(R + Math.cos(a) * rr).toFixed(2)},${(R + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

function VariantCell({ option, sprite, level, size }: { option: OptionKey; sprite: string; level: number; size: number }) {
  const st = transcendStyle(level);
  const [r, g, b] = st.colorRgb;
  const color = `rgb(${r},${g},${b})`;
  if (option === 'B') return <OptionB sprite={sprite} color={color} size={size} sub={st.sub} />;
  const spritePct = option === 'A' ? 0.52 : option === 'C' ? 0.82 : 0.4;
  return <OptionAFrame sprite={sprite} color={color} size={size} sub={st.sub} spritePct={spritePct} />;
}

export function BorderReviewClient({ sprites }: { sprites: SpriteEntry[] }) {
  const [level, setLevel] = useState<number>(6);
  const [size, setSize] = useState<number>(96);
  const [slot, setSlot] = useState<'all' | 'weapon' | 'armor' | 'accessory'>('all');
  const [borderOnly, setBorderOnly] = useState(false);
  const [edges, setEdges] = useState<Record<string, number>>({});
  const startedRef = useRef(false);

  // 외곽선 강도 측정(전체) — 점진적, 시작 1회.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      const batch = 8;
      for (let i = 0; i < sprites.length; i += batch) {
        const slice = sprites.slice(i, i + batch);
        const results = await Promise.all(slice.map((s) => detectEdgeStrength(s.path)));
        if (cancelled) return;
        setEdges((prev) => {
          const next = { ...prev };
          slice.forEach((s, k) => (next[s.code] = results[k]!));
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sprites]);

  const visible = useMemo(() => {
    return sprites.filter((s) => {
      if (slot !== 'all' && s.slot !== slot) return false;
      if (borderOnly && (edges[s.code] ?? 0) < 0.35) return false;
      return true;
    });
  }, [sprites, slot, borderOnly, edges]);

  const analyzed = Object.keys(edges).length;
  const borderCount = Object.values(edges).filter((v) => v >= 0.35).length;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 text-zinc-100">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-semibold">테두리 처리 비교 — 4 옵션 × {visible.length}/{sprites.length} sprite</h1>
        <p className="mt-1 text-xs text-zinc-400">
          외곽선 분석: {analyzed}/{sprites.length} (강함≥35% : {borderCount}개)
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
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
            <span className="text-zinc-400">슬롯:</span>
            {SLOTS.map((s) => (
              <button
                key={s.v}
                onClick={() => setSlot(s.v as typeof slot)}
                className={`rounded px-2 py-0.5 ${
                  slot === s.v
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">크기:</span>
            {[64, 96, 128].map((v) => (
              <button
                key={v}
                onClick={() => setSize(v)}
                className={`rounded px-2 py-0.5 font-mono ${
                  size === v
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={borderOnly}
              onChange={(e) => setBorderOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="text-zinc-300">외곽선 강한 것만</span>
          </label>
        </div>
      </header>

      <div className="grid grid-cols-[180px_repeat(4,1fr)] gap-x-3 gap-y-1 text-xs">
        <div className="sticky top-[7.5rem] z-[5] bg-zinc-950 py-2 text-zinc-400">아이템</div>
        {OPTIONS.map((o) => (
          <div key={o.key} className="sticky top-[7.5rem] z-[5] bg-zinc-950 py-2">
            <div className="font-semibold text-zinc-100">
              <span className="mr-1 font-mono text-amber-300">{o.key}.</span>
              {o.title}
            </div>
            <div className="text-zinc-500">{o.sub}</div>
          </div>
        ))}

        {visible.map((s) => {
          const edge = edges[s.code];
          const strong = edge != null && edge >= 0.35;
          return (
            <div key={s.code} className="contents">
              <div className="flex flex-col justify-center border-t border-zinc-900 py-2">
                <div className="truncate font-mono text-[11px] text-zinc-300">{s.code}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span>{s.slot}</span>
                  {edge != null ? (
                    <span className={strong ? 'text-amber-400' : 'text-zinc-600'}>
                      외곽 {(edge * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-zinc-700">…</span>
                  )}
                </div>
              </div>
              {OPTIONS.map((o) => (
                <div
                  key={o.key}
                  className="flex items-center justify-center border-t border-zinc-900 py-2"
                >
                  <VariantCell option={o.key} sprite={s.path} level={level} size={size} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
