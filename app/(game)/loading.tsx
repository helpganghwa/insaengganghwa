'use client';

import { useState } from 'react';

import { SPRITE_MANIFEST } from '@/lib/game/equipment/sprite-manifest';

const SPRITES = Object.values(SPRITE_MANIFEST);

/**
 * 화면 이동 로딩 (grow식) — (game) 라우트 그룹 세그먼트 전환 Suspense 폴백.
 * 랜덤 아이템 스프라이트 1장을 크게 노출(매 전환마다 새로 추첨). 셸(헤더/하단탭)은
 * 레이아웃이 유지되고 본문 영역만 이 화면으로 대체됨.
 */
export default function GameLoading() {
  // 마운트마다 1회 추첨 — 전환마다 다른 아이템.
  const [src] = useState(
    () => SPRITES[Math.floor(Math.random() * SPRITES.length)] ?? null,
  );

  return (
    <div className="flex min-h-[70dvh] w-full flex-col items-center justify-center gap-5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트(next/image 부적합, 프로젝트 컨벤션)
        <img
          src={src}
          alt=""
          width={112}
          height={112}
          className="h-28 w-28 animate-pulse"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <div className="h-28 w-28 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      )}
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500" />
        <span className="ml-1.5">불러오는 중…</span>
      </div>
    </div>
  );
}
