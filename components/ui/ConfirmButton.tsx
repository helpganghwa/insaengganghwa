'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 3초 인-버튼 재확인 버튼(2026-08-07 렌더 감사) — 카운트다운 state를 버튼 안에 격리.
 * 이전엔 각 화면 최상위 state(confirm/confirmLeft 쌍)라 확인 중 3초간 화면 전체
 * (지도·보드·레이드 카드 등)가 매초 리렌더됐다 — 7곳 공통 패턴의 일괄 해소.
 *
 * 동작: 첫 탭=무장(armed, 카운트 시작) → 무장 중 재탭=onConfirm 실행 → 카운트 소진=자동 해제.
 * armed 여부에 따른 시각 변화는 children(armed, left) 렌더 함수와 armedClassName으로 표현.
 */
export function ConfirmButton({
  onConfirm,
  onArm,
  disabled,
  seconds = 3,
  className,
  armedClassName,
  pulseClassName,
  children,
}: {
  onConfirm: () => void;
  /** 무장되는 순간 1회(무장 시점 랜덤 문구 선택 등). */
  onArm?: () => void;
  disabled?: boolean;
  seconds?: number;
  className: string;
  /** 무장 중 대체 클래스(없으면 className 유지). */
  armedClassName?: string;
  /** 무장 중 배경 펄스 오버레이 클래스(예: 'bg-sky-500'). 없으면 오버레이 없음. */
  pulseClassName?: string;
  children: (armed: boolean, left: number) => ReactNode;
}) {
  const [left, setLeft] = useState(0);
  const armed = left > 0;
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setLeft(0);
          onConfirm();
        } else {
          onArm?.();
          setLeft(seconds);
        }
      }}
      className={`relative isolate overflow-hidden ${armed && armedClassName ? armedClassName : className}`}
    >
      {armed && pulseClassName ? (
        <span
          aria-hidden
          className={`absolute inset-0 ${pulseClassName}`}
          style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
        />
      ) : null}
      <span className="relative">{children(armed, left)}</span>
    </button>
  );
}
