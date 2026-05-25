import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드.
 *
 * 디자인(2026-05-25 v3):
 *  - h-24 banner. 좌측 텍스트 + 우측 마스코트(bust) + 풍부한 환경 합성
 *  - 마스코트 = user-mascot-bust-south-west(머리+어깨+가슴, 좌측 텍스트를 봄)
 *  - 환경:
 *    * 따뜻한 3-stop 그라데이션 배경
 *    * 우측 amber radial halo (마스코트 광원)
 *    * 6개 sparkle 입자(다양한 크기·glow) — 마법/보급 정서
 *    * 좌→우 어두운 fade로 텍스트 가독성 보호
 *  - 노출 조건: 오늘 KST 일일 보급 1건 이상 미수령
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      className="relative flex h-24 overflow-hidden rounded-xl border border-amber-600/40 bg-gradient-to-r from-[#1a0e02] via-[#3d2208] to-[#7a4d12] transition active:scale-[0.99]"
    >
      {/* 우측 amber radial halo — 마스코트가 광원에 감싸진 듯 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[65%]"
        style={{
          background:
            'radial-gradient(ellipse at 80% 50%, rgba(250,180,60,0.5) 0%, rgba(245,158,11,0.2) 38%, transparent 75%)',
        }}
      />

      {/* sparkle 입자 — 위치·크기·발광 다양화로 풍성한 정서 */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-3 right-[55%] h-1 w-1 rounded-full bg-amber-100 shadow-[0_0_4px_rgba(252,211,77,0.9)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-8 right-[42%] h-1.5 w-1.5 rounded-full bg-yellow-200 shadow-[0_0_8px_rgba(252,211,77,1)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-16 right-[50%] h-1 w-1 rounded-full bg-amber-50 shadow-[0_0_5px_rgba(252,211,77,0.9)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-5 right-[35%] h-0.5 w-0.5 rounded-full bg-yellow-100 shadow-[0_0_3px_rgba(252,211,77,0.8)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-12 right-[28%] h-0.5 w-0.5 rounded-full bg-amber-200 shadow-[0_0_3px_rgba(252,211,77,0.8)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-2 right-[18%] h-1 w-1 rounded-full bg-yellow-300 shadow-[0_0_6px_rgba(252,211,77,1)]"
      />

      {/* 마스코트 bust — 좌측 시선(south-west) + 우측 bottom-align */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/characters/user-mascot-bust-south-west.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute right-2 bottom-0 h-[115%] w-auto drop-shadow-[0_0_8px_rgba(252,211,77,0.4)]"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* 좌→우 어두운 fade — 좌측 텍스트 가독성 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="text-2xl leading-none drop-shadow">
          📬
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300/95 drop-shadow">
            오늘의 보급 도착
          </div>
          <div className="text-[13px] font-bold text-white drop-shadow-sm">
            💎 1,000 + 보급권 3종
          </div>
        </div>
      </div>
    </Link>
  );
}
