import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';
import {
  CHECKIN_CALENDAR,
  isCheckinMilestone,
  nextCheckinDay1Indexed,
  type CheckinReward,
} from '@/lib/game/balance';

/**
 * 홈 §1.1 — 28일 출석 캘린더 진입 카드 (WIREFRAMES §1.1, BALANCE §7).
 *
 * 노출 조건: 오늘 KST 출석 미수령(`state.last_claimed_kst_day !== KST today`).
 * 배경: Pixellab pixflux 384×96 wide banner (checkin-bg.png) — 좌측 달력판, 우측 amber 광원.
 */
function todayLabel(reward: CheckinReward): string {
  if (reward.kind === 'diamond') return `💎 ${reward.amount.toLocaleString('ko-KR')}`;
  if (reward.kind === 'supply') {
    const emoji = reward.slot === 'weapon' ? '⚔️' : reward.slot === 'armor' ? '🛡️' : '💍';
    const label = reward.slot === 'weapon' ? '무기' : reward.slot === 'armor' ? '방어구' : '장신구';
    return `${emoji} ${label} 보급권 ${reward.count}장`;
  }
  return `📦 보급권 3종 각 ${reward.perSlot}장`;
}

export function HubCheckinCard({ dayProgress }: { dayProgress: number }) {
  const todayDay = nextCheckinDay1Indexed(dayProgress);
  const reward = CHECKIN_CALENDAR[todayDay - 1]!;
  const milestone = isCheckinMilestone(todayDay);

  return (
    <Link
      href="/checkin"
      className="relative flex h-24 overflow-hidden rounded-xl border border-amber-600/40 transition active:scale-[0.99]"
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
      {/* 좌→우 어두운 fade — 텍스트 가독성 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />

      <div className="relative z-10 flex w-full items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="text-2xl leading-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            오늘 출석 (D{todayDay}{milestone ? ' · ★' : ''})
          </div>
          <div className="text-[13px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {todayLabel(reward)}
          </div>
        </div>
        <span className="text-[11px] font-semibold text-amber-200/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          수령 →
        </span>
      </div>
    </Link>
  );
}
