import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드. 마스코트 + 환경 효과로 자연스러운 배경.
 *
 * 노출 조건: 오늘 KST 일일 보급 1건 이상 미수령. 수령 완료 시 카드 숨김.
 *
 * 디자인:
 *  - h-20 슬림 banner, 좌측 텍스트 + 우측 마스코트(어깨~머리)
 *  - 마스코트 = south-west 방향(좌측 텍스트를 바라봄)
 *  - 마스코트는 카드 ~3.5배 크기 + top-aligned로 어깨/머리만 노출
 *  - 우측에 따뜻한 amber halo + sparkle 입자 → 마스코트가 떠 있지 않고 광원에 녹음
 *  - 좌→우 어두운 fade로 텍스트 가독성 보호
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      className="relative flex h-20 overflow-hidden rounded-xl border border-amber-600/40 bg-gradient-to-r from-[#2a1804] via-[#3d2208] to-[#5a3a10] transition active:scale-[0.99]"
    >
      {/* 우측 amber 광원 halo — 마스코트가 빛에 감싸진 듯 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[180px]"
        style={{
          background:
            'radial-gradient(circle at 75% 50%, rgba(245,158,11,0.35) 0%, rgba(245,158,11,0.12) 40%, transparent 75%)',
        }}
      />

      {/* sparkle 입자 — 마법/보급 정서 */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-[68px] top-2 h-1 w-1 rounded-full bg-amber-100 opacity-90 shadow-[0_0_4px_rgba(252,211,77,0.9)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-[44px] top-7 h-1.5 w-1.5 rounded-full bg-yellow-200 opacity-80 shadow-[0_0_6px_rgba(252,211,77,1)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-[86px] top-12 h-0.5 w-0.5 rounded-full bg-amber-50 opacity-90 shadow-[0_0_3px_rgba(252,211,77,0.9)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-[32px] top-3 h-0.5 w-0.5 rounded-full bg-amber-100 opacity-80"
      />

      {/* 마스코트 — south-west(좌측 시선) + 매우 크게 top-aligned (어깨~머리만 노출). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/characters/user-mascot-south-west.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute right-0 top-0 h-[280px] w-auto"
        style={{
          imageRendering: 'pixelated',
          // 캐릭터 머리·어깨가 카드 안에 들어오도록 살짝 위로 오프셋(완전 정수 단위).
          transform: 'translateY(-12px)',
          transformOrigin: 'top right',
        }}
      />

      {/* 좌→우 어두운 fade — 좌측 텍스트 가독성 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="text-xl leading-none drop-shadow">
          📬
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300/95 drop-shadow">
            오늘의 보급 도착
          </div>
          <div className="text-[12px] font-bold text-white drop-shadow-sm">
            💎 1,000 + 보급권 3종
          </div>
        </div>
      </div>
    </Link>
  );
}
