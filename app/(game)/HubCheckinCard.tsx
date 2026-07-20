import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1.1 — 28일 출석 캘린더 진입 카드 (WIREFRAMES §1.1, BALANCE §7).
 *
 * 노출 조건: 오늘 KST 미수령(`state.last_claimed_kst_day !== KST today`).
 * 배경: Pixellab pixflux 384×64 wide banner (checkin-bg.png).
 * 보상 미리보기·"수령 →" 라벨은 노출 X — 안내 문구만(사용자 결정 2026-05-26).
 */
export function HubCheckinCard() {
  return (
    <Link prefetch={false}
      href="/checkin"
      className="relative flex h-full w-full overflow-hidden transition active:scale-[0.99]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/checkin-bg.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/20" />

      <div className="relative z-10 flex w-full items-center px-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            출석 캘린더
          </div>
          <div className="truncate text-[12px] font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            오늘의 인장이 비었습니다. 도장을 찍고 보상을 받으세요.
          </div>
        </div>
      </div>
    </Link>
  );
}
