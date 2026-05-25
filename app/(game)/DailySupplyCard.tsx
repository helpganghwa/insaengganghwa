import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드. WIREFRAMES §1 미구현분 보강(2026-05-25).
 *
 * 노출 조건:
 *  - 오늘(KST) 일일 보급 우편 1건 이상 미수령(claimed_at IS NULL)
 *  - 수령 완료 시 카드 숨김(다음 KST 00:00에 ensureDailyMail로 재등장)
 *
 * 디자인(SCREEN-ANALYSIS §4):
 *  - h-20 슬림 banner
 *  - 좌측: 📬 + 텍스트(오늘의 보급 + 보상 요약) + 우측 "수령하기"
 *  - 우측 끝: 인생강화 공식 마스코트(south-east) — 카드 높이보다 살짝 크게,
 *    bottom-align으로 다리 일부만 잘리고 캐릭터 정체성 노출 (자연스러운 녹임)
 *  - 배경: 따뜻한 갈색 그라데이션 + 좌측 어둡게(텍스트 가독성)
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      className="relative flex h-20 overflow-hidden rounded-xl border border-amber-600/40 bg-gradient-to-r from-[#3a2406] via-[#3a2406] to-[#5a3a10] transition active:scale-[0.99]"
    >
      {/* 마스코트 — 우측 bottom-align, 카드 높이의 ~140%로 다리 일부만 잘림. */}
      {/* 좌측 텍스트 영역과 안 겹치도록 우측에만. pointer-events:none으로 클릭 방해 X. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/characters/user-mascot-south-east.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute right-0 bottom-0 h-[140%] w-auto"
        style={{ imageRendering: 'pixelated' }}
      />
      {/* 좌→우 페이드 — 마스코트 위에 자연스러운 그라데이션, 좌측 텍스트 가독성 보호. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
      {/* 우측 텍스트(수령하기)를 마스코트 위 살짝 어둡게 — 텍스트 가독성 + 캐릭터 보임. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-black/55 to-transparent" />

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
        <span aria-hidden className="shrink-0 text-[11px] font-semibold text-amber-200 drop-shadow">
          수령하기
        </span>
      </div>
    </Link>
  );
}
