import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드.
 *
 * 디자인(2026-05-25 v4):
 *  - h-24 banner
 *  - 배경: Pixellab pixflux 생성 wide banner(daily-supply-bg.png)
 *    좌측 보물상자/리본 + 중앙 떠있는 다이아·sparkle + 우측 amber 광원
 *  - 마스코트 bust(south-west, 좌측 시선) — 우측 amber 영역에 자연스럽게 녹음
 *  - 좌→우 어두운 fade로 텍스트 가독성 보호
 *  - 노출 조건: 오늘 KST 일일 보급 1건 이상 미수령
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      className="relative flex h-24 overflow-hidden rounded-xl border border-amber-600/40 transition active:scale-[0.99]"
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

      {/* 마스코트(보급 들고 웃는 state v2, 눈 뜬 미소). south-west = 좌측 아래 시선. */}
      {/* 같은 character group(59ead3b2 3rd state, id 0fd71429...). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/characters/mascot-supply-v2-bust-south-west.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute right-2 bottom-0 h-[115%] w-auto drop-shadow-[0_0_10px_rgba(252,211,77,0.55)]"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* 좌→우 어두운 fade — 텍스트 가독성 강화 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="text-2xl leading-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]">
          📬
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            오늘의 보급 도착
          </div>
          <div className="text-[13px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            💎 1,000 + 보급권 3종
          </div>
        </div>
      </div>
    </Link>
  );
}
