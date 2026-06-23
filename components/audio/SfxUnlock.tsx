'use client';

import { useEffect } from 'react';

import { unlockSfx } from '@/lib/audio/sfx';

/**
 * 효과음 AudioContext 해금 — 마운트 전용(렌더 없음). 브라우저 자동재생 정책상 오디오는
 * 첫 사용자 제스처 후에야 재생되므로, 1회 pointerdown으로 AudioContext를 미리 resume한다.
 * (강화 결과음처럼 비동기 콜백에서 울리는 소리도 컨텍스트가 이미 깨어 있어 안정적으로 재생.)
 */
export function SfxUnlock() {
  useEffect(() => {
    const onGesture = () => unlockSfx();
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, []);

  return null;
}
