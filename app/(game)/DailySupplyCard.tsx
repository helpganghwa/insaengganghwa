import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 홈 §1 — 오늘의 보급 카드. WIREFRAMES §1 미구현분 보강(2026-05-25).
 *
 * 노출 조건:
 *  - 오늘(KST) 일일 보급 우편 1건 이상 미수령(claimed_at IS NULL)
 *  - 수령 완료 시 카드 숨김(다음 KST 00:00에 ensureDailyMail로 재등장)
 *
 * 동작: 클릭 → `/mail` 이동. 시각: 슬림 banner(h-20) — 메뉴 그리드 가림 최소화.
 * 캐릭터 트랙 후속: courier(배달부) NPC 채택 시 본 배경 교체 검토(전달 정서 강화).
 */
export function DailySupplyCard() {
  return (
    <Link
      href="/mail"
      style={{ backgroundColor: '#3a2406' }}
      className="relative flex h-20 overflow-hidden rounded-xl border border-amber-600/40 transition active:scale-[0.99]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/daily-supply.png')}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover opacity-80"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
      <div className="relative z-10 flex w-full items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="text-xl leading-none">📬</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300/95">
            오늘의 보급 도착
          </div>
          <div className="text-[12px] font-bold text-white drop-shadow-sm">
            💎 1,000 + 보급권 3종
          </div>
        </div>
        <span aria-hidden className="shrink-0 text-[11px] font-semibold text-amber-200/95">
          수령하기
        </span>
      </div>
    </Link>
  );
}
