/**
 * 강화 결과 시각 이펙트 오버레이 — 카드 내부 absolute 레이어.
 *
 * 4-tier:
 *  - 'success-mega': Boast 레벨(+30/+50/+99) 도달 — 화려한 광채 + 4방향 별 폭발
 *  - 'success'     : 일반 성공 — 그린 펄스 + +1 카운터 솟구침
 *  - 'hold'        : 유지 — 회색 안개 좌→우 흐름 (실망감 회피, 중립 톤)
 *  - 'down'        : 하락 — 빨강 균열 + 카드 진동(부모 컨테이너에서 처리)
 *
 * 현재는 CSS-only 폴백. Pixellab 스프라이트 도착 시 각 tier의 .fx-* 클래스만
 * `background-image: url('/fx/enhance-{tier}.png')` + `animation: fx-sprite-N`
 * 으로 교체. 타이밍/햅틱 흐름은 그대로 유지.
 *
 * 햅틱(Vibration API)·prefers-reduced-motion은 부모(EnhanceSlotCard)가 트리거 시 처리.
 */
'use client';

import { memo } from 'react';

export type FxKind = 'success-mega' | 'success' | 'hold' | 'down';

interface Props {
  kind: FxKind;
  /** 카운터 텍스트(success/mega 한정). 미지정 시 비표시. */
  counter?: string;
}

function MegaFX({ counter }: { counter?: string }) {
  // 4방향 광채 폭발. CSS var --burst-deg로 각 별 회전 각도 주입.
  const directions = [0, 90, 180, 270];
  return (
    <>
      {/* 카드 전체 골든 글로우 — z-0 (콘텐츠 뒤). */}
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mega-glow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(253, 224, 71, 0.55), rgba(245, 158, 11, 0.25) 40%, transparent 70%)',
          boxShadow: 'inset 0 0 32px 8px rgba(253, 224, 71, 0.4)',
        }}
      />
      {/* Pixellab sprite — 골든 폭발 PNG, 중앙 80px. 폴백 글로우 위에 합성. */}
      <span className="fx-sprite fx-sprite-success-mega animate-fx-mega-glow pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-20 w-20" />
      {/* 4방향 별 — 중앙에서 확산. z-10. */}
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
    </>
  );
}

function SuccessFX({ counter }: { counter?: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* 폴백 그린 펄스 — sprite 뒤. */}
      <span
        className="animate-fx-success-pop absolute h-20 w-20 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(52, 211, 153, 0.7), rgba(16, 185, 129, 0.3) 50%, transparent 75%)',
        }}
      />
      {/* Pixellab sprite — 그린 별 PNG, 중앙 64px. */}
      <span className="fx-sprite fx-sprite-success animate-fx-success-pop absolute h-16 w-16" />
      {counter ? (
        <span className="animate-fx-counter-pop relative font-bold text-lg text-emerald-100 drop-shadow-[0_0_4px_rgba(52,211,153,0.9)] tabular-nums">
          {counter}
        </span>
      ) : null}
    </span>
  );
}

function HoldFX() {
  return (
    <>
      {/* 폴백 안개 sweep — sprite 뒤에 가로 흐름. */}
      <span
        className="pointer-events-none absolute inset-0 animate-fx-mist"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(161, 161, 170, 0.45) 35%, rgba(212, 212, 216, 0.5) 50%, rgba(161, 161, 170, 0.45) 65%, transparent 100%)',
        }}
      />
      {/* Pixellab sprite — 회색 안개 PNG, 카드 폭 전체. */}
      <span className="fx-sprite fx-sprite-hold animate-fx-mist pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-24 opacity-80" />
    </>
  );
}

function DownFX() {
  // SVG 균열 + Pixellab sprite 합성. 폴백 SVG는 sprite 뒤에 카드 중앙 영역.
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* 폴백 SVG 균열 — sprite 뒤. */}
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
      {/* Pixellab sprite — 빨강 균열 PNG, 중앙 80px. */}
      <span className="fx-sprite fx-sprite-down animate-fx-crack absolute h-20 w-20" />
    </span>
  );
}

export const EnhanceFX = memo(function EnhanceFX({ kind, counter }: Props) {
  if (kind === 'success-mega') return <MegaFX counter={counter} />;
  if (kind === 'success') return <SuccessFX counter={counter} />;
  if (kind === 'hold') return <HoldFX />;
  return <DownFX />;
});
