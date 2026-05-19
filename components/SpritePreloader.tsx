'use client';

import { useEffect } from 'react';

import { LOADING_SPRITES } from '@/lib/game/equipment/loading-sprites';

/**
 * 로딩 스프라이트 풀을 브라우저 캐시에 미리 적재 — 화면 이동 시 loading.tsx의
 * <img>가 네트워크 대기 없이 **즉시** 표시되도록. (game) 레이아웃에 1회 마운트.
 * 렌더 출력 없음.
 */
export function SpritePreloader() {
  useEffect(() => {
    for (const src of LOADING_SPRITES) {
      const img = new Image();
      img.src = src;
    }
  }, []);
  return null;
}
