import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 배틀패스 상시 배너. 오늘의 보급/출석 배너 아래에 항상 노출(만료 없는 성장 패스).
 * 전용 아트는 TODO — 현재 tint + 그라데이션 placeholder(art 추가 시 bg 이미지로 교체).
 */
export function BattlePassBanner() {
  return (
    <Link
      href="/battlepass"
      style={{ backgroundColor: '#2e1640' }}
      className="relative flex h-16 w-full min-w-0 items-center overflow-hidden rounded-xl border border-amber-600/40 transition active:scale-[0.99]"
    >
      {/* 전용 아트(TODO) — 없으면 tint만(alt="" → 깨진 아이콘 없음). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/battlepass.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

      <div className="relative z-10 flex w-full items-center px-3.5">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            배틀패스
          </div>
          <div className="truncate text-[12px] font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            강화·초월 최고 도달마다 보상이 쌓여요.
          </div>
        </div>
      </div>
    </Link>
  );
}
