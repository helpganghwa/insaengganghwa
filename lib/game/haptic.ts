'use client';

// 햅틱 피드백 헬퍼 — navigator.vibrate.
// iOS Safari는 미지원, Android Chrome/Samsung 등에서 동작.
// 권한 불필요 — 사용자 제스처 핸들러 안에서만 호출.

export function tap(): void {
  if (typeof navigator === 'undefined') return;
  navigator.vibrate?.(10);
}

export function success(): void {
  if (typeof navigator === 'undefined') return;
  navigator.vibrate?.([15, 30, 15]);
}

export function warning(): void {
  if (typeof navigator === 'undefined') return;
  navigator.vibrate?.([30, 50, 30, 50, 30]);
}

export function error(): void {
  if (typeof navigator === 'undefined') return;
  navigator.vibrate?.([100]);
}
