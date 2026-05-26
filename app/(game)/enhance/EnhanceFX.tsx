/**
 * 강화 결과 시각 이펙트 오버레이 — 카드 내부 absolute 레이어.
 *
 * 4-tier:
 *  - 'success-mega' (Boast +30/+50/+99): 골든 글로우 + 4방향 별 + cheer 캐릭터(4종 랜덤) + 카운터
 *  - 'success'                          : 그린 펄스 + cheer 캐릭터(4종 랜덤) + 카운터
 *  - 'hold'                             : 회색 안개 sweep + hold 캐릭터(2종 랜덤)
 *  - 'down'                             : 빨강 SVG 균열 + 카드 진동 + down 캐릭터(2종 랜덤)
 *
 * 캐릭터 — DailySupplyCard 스타일: 우측에서 슬라이드 인 + 카드 높이의 ~200%로 상반신 강조.
 * 햅틱/prefers-reduced-motion은 부모(EnhanceSlotCard)에서 처리.
 */
'use client';

import { memo, useMemo } from 'react';

export type FxKind = 'success-mega' | 'success' | 'hold' | 'down';

interface Props {
  kind: FxKind;
  /** 카운터 텍스트(success/mega 한정). */
  counter?: string;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const CHEER_POOL = ['fx-char-cheer-1', 'fx-char-cheer-2', 'fx-char-cheer-3', 'fx-char-cheer-4'] as const;
const HOLD_POOL = ['fx-char-hold-1', 'fx-char-hold-2'] as const;
const DOWN_POOL = ['fx-char-down-1', 'fx-char-down-2'] as const;

/**
 * 카드 우측 상반신 캐릭터 — 우측에서 슬라이드 인.
 * h-[200%] + bottom-0로 캐릭터의 위 절반(상반신)만 카드 안에 표시, 하반신은 overflow-hidden로 잘림.
 */
function CharOverlay({ cls }: { cls: string }) {
  return (
    <span
      className={`fx-char ${cls} animate-fx-char-slide pointer-events-none absolute right-0 top-0 h-[160%] aspect-square z-20 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]`}
    />
  );
}

function MegaFX({ counter }: { counter?: string }) {
  const directions = [0, 90, 180, 270];
  const charCls = useMemo(() => pickRandom(CHEER_POOL), []);
  return (
    <>
      {/* 카드 전체 골든 글로우. */}
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mega-glow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(253, 224, 71, 0.55), rgba(245, 158, 11, 0.25) 40%, transparent 70%)',
          boxShadow: 'inset 0 0 32px 8px rgba(253, 224, 71, 0.4)',
        }}
      />
      {/* 4방향 별 + 카운터 — 카드 좌측 중앙(캐릭터와 분리). */}
      <span className="pointer-events-none absolute inset-y-0 left-0 right-[100px] flex items-center justify-center">
        {directions.map((deg) => (
          <span
            key={deg}
            className="absolute animate-fx-mega-burst text-2xl text-yellow-200 drop-shadow-[0_0_6px_rgba(253,224,71,0.9)]"
            style={{ ['--burst-deg' as string]: `${deg}deg` }}
          >
            ✦
          </span>
        ))}
        {counter ? (
          <span className="animate-fx-counter-pop relative font-black text-2xl text-yellow-100 drop-shadow-[0_0_8px_rgba(253,224,71,1)] tabular-nums">
            {counter}
          </span>
        ) : null}
      </span>
      <CharOverlay cls={charCls} />
    </>
  );
}

function SuccessFX({ counter }: { counter?: string }) {
  const charCls = useMemo(() => pickRandom(CHEER_POOL), []);
  return (
    <>
      <span className="pointer-events-none absolute inset-y-0 left-0 right-[100px] flex items-center justify-center">
        <span
          className="animate-fx-success-pop absolute h-20 w-20 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(52, 211, 153, 0.7), rgba(16, 185, 129, 0.3) 50%, transparent 75%)',
          }}
        />
        {counter ? (
          <span className="animate-fx-counter-pop relative font-bold text-lg text-emerald-100 drop-shadow-[0_0_4px_rgba(52,211,153,0.9)] tabular-nums">
            {counter}
          </span>
        ) : null}
      </span>
      <CharOverlay cls={charCls} />
    </>
  );
}

function HoldFX() {
  const charCls = useMemo(() => pickRandom(HOLD_POOL), []);
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mist"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(161, 161, 170, 0.45) 35%, rgba(212, 212, 216, 0.5) 50%, rgba(161, 161, 170, 0.45) 65%, transparent 100%)',
        }}
      />
      <CharOverlay cls={charCls} />
    </>
  );
}

function DownFX() {
  const charCls = useMemo(() => pickRandom(DOWN_POOL), []);
  return (
    <>
      {/* SVG 균열 — 카드 좌측 영역(캐릭터와 분리). */}
      <span className="pointer-events-none absolute inset-y-0 left-0 right-[100px] flex items-center justify-center">
        <svg
          viewBox="0 0 100 60"
          className="animate-fx-crack absolute h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <filter id="crack-glow">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          <g
            stroke="rgb(248, 113, 113)"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
            filter="url(#crack-glow)"
            style={{ filter: 'drop-shadow(0 0 4px rgba(248, 113, 113, 0.8))' }}
          >
            <path d="M 35 55 L 42 38 L 36 28 L 44 14 L 40 4" />
            <path d="M 65 55 L 58 40 L 64 30 L 56 18 L 60 6" />
            <path d="M 50 58 L 50 36 L 46 24 L 52 10" />
          </g>
        </svg>
      </span>
      <CharOverlay cls={charCls} />
    </>
  );
}

export const EnhanceFX = memo(function EnhanceFX({ kind, counter }: Props) {
  if (kind === 'success-mega') return <MegaFX counter={counter} />;
  if (kind === 'success') return <SuccessFX counter={counter} />;
  if (kind === 'hold') return <HoldFX />;
  return <DownFX />;
});
