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
      {/* 배틀패스 엠블럼(Pixellab) — 우측 장식. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/battlepass-emblem.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute top-1/2 right-2 h-[155%] w-auto -translate-y-1/2 drop-shadow-[0_0_8px_rgba(252,211,77,0.45)]"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#2e1640] via-[#2e1640]/70 to-transparent" />

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
