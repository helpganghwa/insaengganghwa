/**
 * 강화 결과 시각 이펙트 오버레이 — 카드 내부 absolute 레이어.
 *
 * 4-tier:
 *  - 'success-mega' (Boast +30/+50/+99): 골든 글로우 + 4방향 별 + cheer 캐릭터(4종 랜덤) + 카운터
 *  - 'success'                          : 그린 펄스 + cheer 캐릭터(4종 랜덤) + 카운터
 *  - 'hold'                             : 회색 안개 sweep + hold 캐릭터(2종 랜덤)
 *  - 'down'                             : 빨강 충격파(concentric rings stagger) + 카드 진동 + down 캐릭터(2종 랜덤)
 *
 * 캐릭터 — 큰 상반신(h-[240%]), 우상단. fade-in/out만(슬라이드 없음).
 * 카운터/추상 FX — 카드 전체 inset-0 중앙(캐릭터와 z-order로 분리).
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
 * 카드 우상단 큰 캐릭터(h-[240%] aspect-square). 단순 fade-in/out.
 * 상반신만 카드 안에 보이고 하반신은 overflow-hidden로 잘림.
 */
function CharOverlay({ cls }: { cls: string }) {
  return (
    <span
      className={`fx-char ${cls} animate-fx-char-appear pointer-events-none absolute right-[-20px] top-[-30px] h-[400%] aspect-square z-25 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]`}
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
      {/* 캐릭터 — 우측 z-20. */}
      <CharOverlay cls={charCls} />
      {/* 4방향 별 + 카운터 — 카드 전체 중앙(캐릭터 위 z-30). */}
      <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
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
    </>
  );
}

function SuccessFX({ counter }: { counter?: string }) {
  const charCls = useMemo(() => pickRandom(CHEER_POOL), []);
  return (
    <>
      <CharOverlay cls={charCls} />
      <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
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
  // 충격파 — 3개 ring을 stagger로 발산(0s, 0.15s, 0.3s).
  return (
    <>
      <CharOverlay cls={charCls} />
      <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            className="absolute h-10 w-10 rounded-full border-red-500"
            style={{
              animation: `fx-shockwave 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
              opacity: 0,
              boxShadow: '0 0 12px 2px rgba(239, 68, 68, 0.7)',
            }}
          />
        ))}
      </span>
    </>
  );
}

export const EnhanceFX = memo(function EnhanceFX({ kind, counter }: Props) {
  if (kind === 'success-mega') return <MegaFX counter={counter} />;
  if (kind === 'success') return <SuccessFX counter={counter} />;
  if (kind === 'hold') return <HoldFX />;
  return <DownFX />;
});
