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

// 강화 결과 FX 캐릭터 9장 — 첫 결과 시 깜빡임 방지(new Image()로 디코드 캐시).
const FX_CHAR_FILES = [
  '/fx/char-base.png',
  '/fx/char-cheer-1.png',
  '/fx/char-cheer-2.png',
  '/fx/char-cheer-3.png',
  '/fx/char-cheer-4.png',
  '/fx/char-hold.png',
  '/fx/char-hold-2.png',
  '/fx/char-down.png',
  '/fx/char-down-2.png',
];
let charsWarmed = false;
function warmChars() {
  if (charsWarmed) return;
  charsWarmed = true;
  for (const src of FX_CHAR_FILES) {
    const img = new Image();
    img.src = src;
  }
}

export function SpritePreloader() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!warmed) {
      warmed = true;
      idle(
        () => {
          loadAtlasImage().catch(() => {
            warmed = false;
          });
        },
        { timeout: 5000 },
      );
    }
    idle(warmChars, { timeout: 3000 });
  }, []);
  return null;
}
