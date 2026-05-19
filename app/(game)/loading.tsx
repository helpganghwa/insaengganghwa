'use client';

import { useState } from 'react';

import { LOADING_SPRITES } from '@/lib/game/equipment/loading-sprites';

/**
 * 화면 이동 로딩 (grow식) — (game) 세그먼트 전환 Suspense 폴백.
 * **전체 화면을 오직 아이템 이미지로만** 덮음(텍스트·인디케이터 없음).
 * `fixed inset-0`로 헤더/하단탭까지 덮어 전환 동안 화면=이미지 1장.
 * 풀은 SpritePreloader가 미리 캐시 → 네트워크 대기 없이 즉시 표시.
 */
export default function GameLoading() {
  const [src] = useState(
    () => LOADING_SPRITES[Math.floor(Math.random() * LOADING_SPRITES.length)] ?? null,
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-50 dark:bg-black">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트(next/image 부적합, 프로젝트 컨벤션)
        <img
          src={src}
          alt=""
          width={144}
          height={144}
          className="h-36 w-36"
          style={{ imageRendering: 'pixelated' }}
          decoding="sync"
        />
      ) : null}
    </div>
  );
}
