/**
 * 강화 결과 시각 이펙트 오버레이 — 카드 내부 absolute 레이어.
 *
 * 4-tier:
 *  - 'success-mega': Boast 레벨(+30/+50/+99) 도달 — 골든 폭발 + 4방향 별 + cheer 캐릭터
 *  - 'success'     : 일반 성공 — 그린 펄스 + +1 카운터 + cheer 캐릭터
 *  - 'hold'        : 유지 — 회색 안개 좌→우 + hold 캐릭터(2종 랜덤)
 *  - 'down'        : 하락 — 빨강 균열 + 카드 진동 + down 캐릭터(2종 랜덤)
 *
 * 캐릭터 풀:
 *  - success / mega 공통: char-cheer-1..4 (4종 랜덤)
 *  - hold: char-hold-1, char-hold-2 (2종 랜덤)
 *  - down: char-down-1, char-down-2 (2종 랜덤)
 *
 * 캐릭터 위치: 카드 우상단 작은 영역(56px). 결과 시점에만 fade-in.
 * 햅틱·prefers-reduced-motion은 부모(EnhanceSlotCard)가 트리거 시 처리.
 */
'use client';

import { memo, useMemo } from 'react';

export type FxKind = 'success-mega' | 'success' | 'hold' | 'down';

interface Props {
  kind: FxKind;
  /** 카운터 텍스트(success/mega 한정). 미지정 시 비표시. */
  counter?: string;
}

/** mount 시 1회 결정 — useMemo가 같은 deps 유지. */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const CHEER_POOL = ['fx-char-cheer-1', 'fx-char-cheer-2', 'fx-char-cheer-3', 'fx-char-cheer-4'] as const;
const HOLD_POOL = ['fx-char-hold-1', 'fx-char-hold-2'] as const;
const DOWN_POOL = ['fx-char-down-1', 'fx-char-down-2'] as const;

/** 카드 우상단 캐릭터 오버레이. 56px, fade-in 0.4s. */
function CharOverlay({ cls }: { cls: string }) {
  return (
    <span
      className={`fx-char ${cls} animate-fx-success-pop pointer-events-none absolute top-1 right-1 h-14 w-14 z-20 drop-shadow-[0_0_4px_rgba(0,0,0,0.6)]`}
    />
  );
}

function MegaFX({ counter }: { counter?: string }) {
  const directions = [0, 90, 180, 270];
  const charCls = useMemo(() => pickRandom(CHEER_POOL), []);
  return (
    <>
      {/* 카드 전체 골든 글로우 — z-0. */}
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mega-glow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(253, 224, 71, 0.55), rgba(245, 158, 11, 0.25) 40%, transparent 70%)',
          boxShadow: 'inset 0 0 32px 8px rgba(253, 224, 71, 0.4)',
        }}
      />
      {/* Pixellab sprite 골든 폭발 — 좌측 중앙 80px(우상단 캐릭터와 분리). */}
      <span className="fx-sprite fx-sprite-success-mega animate-fx-mega-glow pointer-events-none absolute top-1/2 left-12 -translate-y-1/2 h-20 w-20" />
      {/* 4방향 별 — 중앙에서 확산. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
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
      {/* 캐릭터 cheer (4종 랜덤) — 카드 우상단. */}
      <CharOverlay cls={charCls} />
    </>
  );
}

function SuccessFX({ counter }: { counter?: string }) {
  const charCls = useMemo(() => pickRandom(CHEER_POOL), []);
  return (
    <>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {/* 폴백 그린 펄스. */}
        <span
          className="animate-fx-success-pop absolute h-20 w-20 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(52, 211, 153, 0.7), rgba(16, 185, 129, 0.3) 50%, transparent 75%)',
          }}
        />
        {/* Pixellab sprite 그린 별. 좌측 중앙 64px. */}
        <span className="fx-sprite fx-sprite-success animate-fx-success-pop absolute left-12 h-16 w-16" />
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
      {/* 폴백 안개 sweep — 카드 폭 전체. */}
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mist"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(161, 161, 170, 0.45) 35%, rgba(212, 212, 216, 0.5) 50%, rgba(161, 161, 170, 0.45) 65%, transparent 100%)',
        }}
      />
      {/* Pixellab sprite 회색 안개. 좌측 96px. */}
      <span className="fx-sprite fx-sprite-hold animate-fx-mist pointer-events-none absolute top-1/2 left-12 -translate-y-1/2 h-16 w-24 opacity-80" />
      <CharOverlay cls={charCls} />
    </>
  );
}

function DownFX() {
  const charCls = useMemo(() => pickRandom(DOWN_POOL), []);
  return (
    <>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
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
        {/* Pixellab sprite 빨강 균열 — 좌측 80px. */}
        <span className="fx-sprite fx-sprite-down animate-fx-crack absolute left-12 h-20 w-20" />
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
