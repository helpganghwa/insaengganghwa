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

import { memo, useEffect, useMemo, useState } from 'react';

import Counter from '@/components/Counter';

export type FxKind = 'success-mega' | 'success' | 'hold' | 'down';

interface Props {
  kind: FxKind;
  /** 강화 직전 레벨 → 결과 레벨로 보간(count up/down/유지). */
  fromLevel?: number;
  toLevel?: number;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * 자릿수 슬롯 카운트 — motion useSpring으로 자연 회전.
 *  - from !== to: Counter value가 from→to 보간(자릿수 하나만 굴러감)
 *  - from === to (hold): 좌우 흔들림만, 숫자 변화 없음
 */
function CountAnim({
  from,
  to,
  className,
  fontSize,
}: {
  from: number;
  to: number;
  className: string;
  fontSize: number;
}) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    if (from === to) {
      setVal(from);
      return;
    }
    // mount 직후 to로 변경 → useSpring이 from→to 보간 실행.
    const t = setTimeout(() => setVal(to), 16);
    return () => clearTimeout(t);
  }, [from, to]);

  if (from === to) {
    return <span className={`animate-fx-num-shake inline-block ${className}`}>+{from}</span>;
  }

  // 폭 안정 — max 자릿수 기준 places 고정.
  const maxAbs = Math.max(Math.abs(from), Math.abs(to));
  const places = [...maxAbs.toString()].map(
    (_, i, a) => 10 ** (a.length - i - 1),
  ) as number[];

  return (
    <span className={`inline-flex items-center leading-none ${className}`}>
      <span>+</span>
      <Counter
        value={val}
        fontSize={fontSize}
        padding={0}
        gap={0}
        horizontalPadding={0}
        borderRadius={0}
        places={places}
        gradientHeight={0}
        gradientFrom="transparent"
        gradientTo="transparent"
      />
    </span>
  );
}

const CHEER_POOL = ['fx-char-cheer-1', 'fx-char-cheer-2', 'fx-char-cheer-3', 'fx-char-cheer-4'] as const;
const HOLD_POOL = ['fx-char-hold-1', 'fx-char-hold-2'] as const;
const DOWN_POOL = ['fx-char-down-1', 'fx-char-down-2'] as const;

/**
 * 카드 우상단 큰 캐릭터(h-[240%] aspect-square). 단순 fade-in/out.
 * 상반신만 카드 안에 보이고 하반신은 overflow-hidden로 잘림.
 */
function CharOverlay({ cls }: { cls: string }) {
  // 위치 조정 가이드(EnhanceFX.tsx · EnhanceSlotCard.tsx 양쪽 동일 값 사용):
  //   right-[Npx]              : 우측 위치(음수=카드 밖). 클수록 캐릭터가 우측으로 빠짐.
  //   top-1/2 + translate-y-X  : 세로. -translate-y-1/2 = 정중앙. calc(-50%+50px) = 50px 아래.
  //   h-[X%]                   : 카드 높이 대비. h-[400%]=368px, h-[500%]=460px.
  return (
    <span
      className={`fx-char ${cls} pointer-events-none absolute right-[-80px] top-1/2 translate-y-[calc(-50%+50px)] h-[400%] aspect-square z-25 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]`}
    />
  );
}

function MegaFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
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
        {fromLevel !== undefined && toLevel !== undefined ? (
          <CountAnim
            from={fromLevel}
            to={toLevel}
            fontSize={28}
            className="animate-fx-counter-modern relative font-bold text-yellow-100 drop-shadow-[0_0_10px_rgba(253,224,71,0.95)] tabular-nums tracking-tight"
          />
        ) : null}
      </span>
    </>
  );
}

function SuccessFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
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
        {fromLevel !== undefined && toLevel !== undefined ? (
          <CountAnim
            from={fromLevel}
            to={toLevel}
            fontSize={24}
            className="animate-fx-counter-modern relative font-bold text-emerald-100 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)] tabular-nums tracking-tight"
          />
        ) : null}
      </span>
    </>
  );
}

function HoldFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
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
      {fromLevel !== undefined && toLevel !== undefined ? (
        <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <CountAnim
            from={fromLevel}
            to={toLevel}
            fontSize={24}
            className="animate-fx-counter-modern relative font-bold text-zinc-100 drop-shadow-[0_0_8px_rgba(161,161,170,0.9)] tabular-nums tracking-tight"
          />
        </span>
      ) : null}
    </>
  );
}

function DownFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
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
        {fromLevel !== undefined && toLevel !== undefined ? (
          <CountAnim
            from={fromLevel}
            to={toLevel}
            fontSize={24}
            className="animate-fx-counter-modern relative font-bold text-red-100 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)] tabular-nums tracking-tight"
          />
        ) : null}
      </span>
    </>
  );
}

export const EnhanceFX = memo(function EnhanceFX({ kind, fromLevel, toLevel }: Props) {
  if (kind === 'success-mega') return <MegaFX fromLevel={fromLevel} toLevel={toLevel} />;
  if (kind === 'success') return <SuccessFX fromLevel={fromLevel} toLevel={toLevel} />;
  if (kind === 'hold') return <HoldFX fromLevel={fromLevel} toLevel={toLevel} />;
  return <DownFX fromLevel={fromLevel} toLevel={toLevel} />;
});
