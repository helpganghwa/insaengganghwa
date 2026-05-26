/**
 * 강화 결과 시각 이펙트 오버레이 — 카드 내부 absolute 레이어.
 *
 * 4-tier:
 *  - 'success-mega' (Boast +30/+50/+99): 골든 글로우 + 4방향 별 + 카운터
 *  - 'success'                          : 그린 펄스 + 카운터
 *  - 'hold'                             : 회색 안개 sweep + 카운터(흔들림)
 *  - 'down'                             : 빨강 충격파 + 카드 진동 + 카운터
 *
 * 캐릭터 오버레이는 흰점 누끼 품질 미달로 폐기(2026-05-26 사용자 결정).
 * 자산은 보존(향후 재도입 가능).
 */
'use client';

import { memo, useEffect, useState } from 'react';

import Counter from '@/components/Counter';

export type FxKind = 'success-mega' | 'success' | 'hold' | 'down';

interface Props {
  kind: FxKind;
  /** 강화 직전 레벨 → 결과 레벨로 보간(count up/down/유지). */
  fromLevel?: number;
  toLevel?: number;
}

/**
 * 자릿수 슬롯 카운트 — motion useSpring으로 자연 회전.
 *  - from !== to: Counter value가 from→to 보간(자릿수 하나만 굴러감)
 *  - from === to (hold): 좌우 약한 흔들림(±1.5px), 숫자 변화 없음
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
    const t = setTimeout(() => setVal(to), 16);
    return () => clearTimeout(t);
  }, [from, to]);

  if (from === to) {
    return <span className={`animate-fx-num-shake inline-block ${className}`}>+{from}</span>;
  }

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

/**
 * 카운터/별/원/충격파 공통 영역 — 카드 상단 ~24px 구간(텍스트 상단끝과 카드 상단끝 중앙).
 * 모든 FX가 같은 위치에 겹쳐 표시되도록 단일 영역으로 통일.
 * 위치 조정: top-[Npx] (현재 2). 클수록 아래.
 */
const FX_CENTER_AREA =
  'pointer-events-none absolute inset-x-0 top-[2px] h-[22px] z-30 flex items-center justify-center';

function MegaFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
  const directions = [0, 90, 180, 270];
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mega-glow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(253, 224, 71, 0.55), rgba(245, 158, 11, 0.25) 40%, transparent 70%)',
          boxShadow: 'inset 0 0 32px 8px rgba(253, 224, 71, 0.4)',
        }}
      />
      {/* 별 + 카운터 — 카운터 위치(FX_CENTER_AREA)에 겹쳐서 배치. */}
      <span className={FX_CENTER_AREA}>
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
            fontSize={22}
            className="relative font-bold text-yellow-100 drop-shadow-[0_0_10px_rgba(253,224,71,0.95)] tabular-nums tracking-tight"
          />
        ) : null}
      </span>
    </>
  );
}

function SuccessFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
  return (
    <span className={FX_CENTER_AREA}>
      {/* 그린 펄스 — 카운터 뒤. */}
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
          fontSize={18}
          className="relative font-bold text-emerald-100 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)] tabular-nums tracking-tight"
        />
      ) : null}
    </span>
  );
}

function HoldFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mist"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(161, 161, 170, 0.45) 35%, rgba(212, 212, 216, 0.5) 50%, rgba(161, 161, 170, 0.45) 65%, transparent 100%)',
        }}
      />
      {fromLevel !== undefined && toLevel !== undefined ? (
        <span className={FX_CENTER_AREA}>
          <CountAnim
            from={fromLevel}
            to={toLevel}
            fontSize={18}
            className="relative font-bold text-zinc-100 drop-shadow-[0_0_8px_rgba(161,161,170,0.9)] tabular-nums tracking-tight"
          />
        </span>
      ) : null}
    </>
  );
}

function DownFX({ fromLevel, toLevel }: { fromLevel?: number; toLevel?: number }) {
  return (
    <span className={FX_CENTER_AREA}>
      {/* 충격파 — 카운터 뒤. */}
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
          fontSize={18}
          className="relative font-bold text-red-100 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)] tabular-nums tracking-tight"
        />
      ) : null}
    </span>
  );
}

export const EnhanceFX = memo(function EnhanceFX({ kind, fromLevel, toLevel }: Props) {
  if (kind === 'success-mega') return <MegaFX fromLevel={fromLevel} toLevel={toLevel} />;
  if (kind === 'success') return <SuccessFX fromLevel={fromLevel} toLevel={toLevel} />;
  if (kind === 'hold') return <HoldFX fromLevel={fromLevel} toLevel={toLevel} />;
  return <DownFX fromLevel={fromLevel} toLevel={toLevel} />;
});
