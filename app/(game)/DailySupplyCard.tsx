import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드. WIREFRAMES §1 미구현분 보강(2026-05-25).
 *
 * 노출 조건:
 *  - 오늘(KST) 일일 보급 우편 1건 이상 미수령(claimed_at IS NULL)
 *  - 수령 완료 시 카드 숨김(다음 KST 00:00에 ensureDailyMail로 재등장)
 *
 * 동작: 클릭 → `/mail` 이동(우편함에서 수령). 다른 우편도 같이 확인 가능.
 * 시각: hub/mail.png 픽셀아트 배경 + 메뉴 카드와 동일한 다크 톤. wide 1열.
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      style={{ backgroundColor: '#3a2406' }}
      className="relative flex aspect-[5/2] overflow-hidden rounded-2xl border border-amber-600/40 transition active:scale-[0.99]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/daily-supply.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover opacity-90"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
      <div className="relative z-10 flex w-full items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-widest text-amber-300/95">
            오늘의 보급 도착
          </div>
          <div className="mt-0.5 text-sm font-bold text-white drop-shadow-sm">
            💎 1,000 + 보급권 3종
          </div>
          <div className="mt-0.5 text-[10px] text-white/70">우편함에서 수령</div>
        </div>
        <span aria-hidden className="shrink-0 text-amber-200/90">
          →
        </span>
      </div>
    </Link>
  );
}
