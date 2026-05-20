'use client';

import { useEffect } from 'react';

import { loadAtlasImage } from '@/lib/game/equipment/sprite-atlas';

/**
 * Sprite atlas(public/sprites/atlas.webp) **1장** prefetch — 첫 페인트 비차단(idle 슬롯).
 * 150 PNG 개별 prefetch는 atlas로 통합돼 사라짐. 첫 atlas 디코드 후 모든 sprite
 * 즉시 렌더 가능(메모리 공유).
 *
 * loadAtlasImage()는 모듈 전역 캐시 Promise — TranscendSprite와 동일 인스턴스 공유.
 */
type IdleCb = (cb: () => void, opts?: { timeout?: number }) => unknown;
const idle: IdleCb =
  typeof window !== 'undefined' &&
  (window as unknown as { requestIdleCallback?: IdleCb }).requestIdleCallback
    ? (window as unknown as { requestIdleCallback: IdleCb }).requestIdleCallback
    : (cb, opts) => setTimeout(cb, opts?.timeout ?? 1500);

let warmed = false;

export function SpritePreloader() {
  useEffect(() => {
    if (warmed || typeof window === 'undefined') return;
    warmed = true;
    idle(() => {
      // 결과 무시 — 캐시 워밍 목적.
      loadAtlasImage().catch(() => {
        warmed = false; // 실패 시 다음 진입에서 재시도 허용.
      });
    }, { timeout: 5000 });
  }, []);
  return null;
}
