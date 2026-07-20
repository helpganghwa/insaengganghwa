import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 배틀패스 상시 배너(만료 없는 성장 패스). 홈 배너 carousel의 마지막 슬라이드로 노출.
 * 프레임리스(h-full) — 테두리/라운드는 carousel outer가 제공. 배너 전체를 덮는 불투명 이미지 + 좌측 fade.
 */
export function BattlePassBanner() {
  return (
    <Link prefetch={false}
      href="/battlepass"
      className="relative flex h-full w-full min-w-0 items-center isolate overflow-hidden transition active:scale-[0.99]"
    >
      {/* 배너 전체 덮는 불투명 이미지 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/battlepass.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      {/* 좌→우 어두운 fade — 텍스트 가독성 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />

      <div className="relative z-10 flex w-full items-center px-3.5">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            성장패스
          </div>
          <div className="truncate text-[12px] font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            강화·초월 최고 도달마다 보상이 쌓여요.
          </div>
        </div>
      </div>
    </Link>
  );
}
