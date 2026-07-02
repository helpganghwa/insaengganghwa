import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 진입 카드.
 *
 * 디자인(2026-05-26 v5):
 *  - h-16 banner (CheckinCard와 통일)
 *  - 배경: Pixellab pixflux wide banner(daily-supply-bg.png) + 좌측 fade
 *  - 마스코트 bust(south-west) — 우측 amber 영역에 자연스럽게 녹음
 *  - 보상 내역·"수령 →" 라벨 노출 X — 안내 문구만(사용자 결정 2026-05-26)
 *  - 노출 조건: 오늘 KST 일일 보급 1건 이상 미수령
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      className="relative flex h-full w-full overflow-hidden transition active:scale-[0.99]"
    >
      {/* Pixellab 생성 배경 — wide banner 풀필 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/daily-supply-bg.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* 마스코트(보급 들고 웃는 state — 빨간 상자, closed-eye smile). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/characters/mascot-supply-bust-south-west.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute right-2 bottom-0 h-[115%] w-auto drop-shadow-[0_0_10px_rgba(252,211,77,0.55)]"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* 좌→우 어두운 fade — 텍스트 가독성 강화 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

      <div className="relative z-10 flex w-full items-center px-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            오늘의 보급
          </div>
          <div className="truncate text-[12px] font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            오늘의 보급이 도착했어요. 우편함에서 받아가세요.
          </div>
        </div>
      </div>
    </Link>
  );
}
