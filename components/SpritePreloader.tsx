'use client';

import { useEffect } from 'react';

import { LOADING_SPRITES } from '@/lib/game/equipment/loading-sprites';

/**
 * 로딩 스프라이트 풀 캐시 워밍. **첫 페인트를 막지 않도록**:
 *  - `requestIdleCallback`(없으면 setTimeout 폴백)로 idle 슬롯에서만 실행
 *  - 12개씩 **청크**로 분산(브라우저가 한 번에 150개 디코드/큐잉 안 하게)
 *  - 모듈 전역 `warmed` 플래그로 1회만(셸 재마운트·다중 마운트 무관)
 *  - HTMLImageElement 참조 유지(`refs`)로 디코드 자원 GC 방지
 * 캐시 헤더(next.config.ts: 7d max-age + SWR 30d)와 합쳐 첫 워밍 후 네트워크 0.
 */

type IdleCb = (cb: () => void, opts?: { timeout?: number }) => unknown;
const idle: IdleCb =
  typeof window !== 'undefined' &&
  (window as unknown as { requestIdleCallback?: IdleCb }).requestIdleCallback
    ? (window as unknown as { requestIdleCallback: IdleCb }).requestIdleCallback
    : (cb, opts) => setTimeout(cb, opts?.timeout ?? 1500);

const CHUNK = 12;
let warmed = false;
const refs: HTMLImageElement[] = [];

export function SpritePreloader() {
  useEffect(() => {
    if (warmed || typeof window === 'undefined') return;
    warmed = true;
    let i = 0;
    const loadNext = () => {
      const end = Math.min(i + CHUNK, LOADING_SPRITES.length);
      for (; i < end; i++) {
        const img = new Image();
        img.src = LOADING_SPRITES[i]!;
        refs.push(img);
      }
      if (i < LOADING_SPRITES.length) idle(loadNext, { timeout: 2000 });
    };
    idle(loadNext, { timeout: 5000 });
  }, []);
  return null;
}
