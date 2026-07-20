'use client';

import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';

/**
 * iOS 포커스 자동 확대 방지 필드 — iOS Safari는 포커스된 input/textarea의 font-size가
 * 16px 미만이면 화면을 자동 확대한다. viewport 스케일 잠금은 금지(390 자동핏, CLAUDE §5.2)라
 * 폰트는 16px로 유지하고 transform scale로 시각 크기만 13px로 낮춘다(앱 본문 타이포와 통일).
 * 래퍼(wrapClassName)가 실제 레이아웃 크기를 정의 — 높이 클래스(h-9 등) 필수.
 * 필드는 1/scale 크기로 절대배치 후 축소되므로 py로 높이를 늘릴 수 없다.
 */
const SCALE = 13 / 16;

const FIELD_STYLE = {
  width: `${((100 / SCALE) * 1).toFixed(3)}%`,
  height: `${((100 / SCALE) * 1).toFixed(3)}%`,
  transform: `scale(${SCALE})`,
  transformOrigin: '0 0',
} as const;

export function ZoomSafeInput({
  wrapClassName,
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  wrapClassName: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <span className={`relative block ${wrapClassName}`}>
      <input
        ref={ref}
        {...props}
        className={`absolute left-0 top-0 text-[16px] ${className ?? ''}`}
        style={FIELD_STYLE}
      />
    </span>
  );
}

export function ZoomSafeTextarea({
  wrapClassName,
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  wrapClassName: string;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <span className={`relative block ${wrapClassName}`}>
      <textarea
        ref={ref}
        {...props}
        className={`absolute left-0 top-0 resize-none text-[16px] ${className ?? ''}`}
        style={FIELD_STYLE}
      />
    </span>
  );
}
