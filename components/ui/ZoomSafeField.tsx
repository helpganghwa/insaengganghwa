'use client';

import { useLayoutEffect, useRef } from 'react';
import type {
  InputHTMLAttributes,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

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

/** autoResize용 — 높이는 layout effect가 직접 정하므로 여기서 고정하지 않는다. */
const AUTO_FIELD_STYLE = {
  width: FIELD_STYLE.width,
  transform: FIELD_STYLE.transform,
  transformOrigin: FIELD_STYLE.transformOrigin,
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
  autoResize,
  minHeight = 36,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  wrapClassName: string;
  /**
   * 내용에 맞춰 높이가 늘어난다. 이때 wrapClassName에 높이 클래스를 주지 말 것 —
   * 높이는 내용이 정한다(래퍼가 크기를 정하는 기본 규약의 예외).
   */
  autoResize?: boolean;
  /** autoResize일 때의 최소 표시 높이(px, 축소 후 기준). */
  minHeight?: number;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // 필드는 1/scale 크기로 그린 뒤 축소되므로, scrollHeight(축소 전)에 scale을 곱해야
  // 래퍼(=실제 레이아웃 크기)가 맞는다. 렌더 결과를 읽어 DOM에 반영하는 동기화라 layout effect.
  useLayoutEffect(() => {
    if (!autoResize) return;
    const el = innerRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    el.style.height = 'auto';
    const raw = Math.max(el.scrollHeight, minHeight / SCALE);
    el.style.height = `${raw}px`;
    wrap.style.height = `${raw * SCALE}px`;
  }, [autoResize, minHeight, props.value]);

  return (
    <span ref={wrapRef} className={`relative block ${wrapClassName}`}>
      <textarea
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        {...props}
        className={`absolute left-0 top-0 resize-none text-[16px] ${className ?? ''}`}
        style={autoResize ? AUTO_FIELD_STYLE : FIELD_STYLE}
      />
    </span>
  );
}

/**
 * select도 같은 확대 대상이다 — iOS는 input/textarea뿐 아니라 **select**도 포커스 시
 * font-size가 16px 미만이면 화면을 확대한다(2026-07-30 전수 점검에서 발견).
 * 방식은 위와 동일(16px + scale)이고, 네이티브 화살표를 지운 자리에 ▼를 직접 그리는
 * 기존 패턴을 유지하려고 화살표는 래퍼가 그린다.
 */
export function ZoomSafeSelect({
  wrapClassName,
  className,
  children,
  arrow = true,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  wrapClassName: string;
  /** 우측 ▼ 표시(네이티브 화살표는 appearance-none으로 지운다). */
  arrow?: boolean;
  ref?: Ref<HTMLSelectElement>;
}) {
  return (
    <span className={`relative block ${wrapClassName}`}>
      <select
        ref={ref}
        {...props}
        className={`absolute left-0 top-0 appearance-none text-[16px] ${className ?? ''}`}
        style={FIELD_STYLE}
      >
        {children}
      </select>
      {arrow ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400 dark:text-zinc-500"
        >
          ▼
        </span>
      ) : null}
    </span>
  );
}
