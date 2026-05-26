'use client';

import { useState, useTransition } from 'react';
import {
  CHECKIN_CALENDAR,
  CHECKIN_CYCLE_DAYS,
  SUPPLY_SLOTS,
  isCheckinMilestone,
  nextCheckinDay1Indexed,
  type CheckinReward,
  type SupplySlot,
} from '@/lib/game/balance';
import { useResourceToast } from '@/components/ResourceToast';

import { claimCheckinAction } from './actions';

const SLOT_LABEL: Record<SupplySlot, string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};
const SLOT_EMOJI: Record<SupplySlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '💍',
};

function rewardSummary(r: CheckinReward): { emoji: string; primary: string; tone: 'dia' | 'sup' } {
  if (r.kind === 'diamond') return { emoji: '💎', primary: `${r.amount.toLocaleString('ko-KR')}`, tone: 'dia' };
  if (r.kind === 'supply') return { emoji: SLOT_EMOJI[r.slot], primary: `${r.count}장`, tone: 'sup' };
  return { emoji: '📦', primary: `각 ${r.perSlot}장`, tone: 'sup' };
}

function rewardLongLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return `다이아 ${r.amount.toLocaleString('ko-KR')}`;
  if (r.kind === 'supply') return `${SLOT_LABEL[r.slot]} 보급권 ${r.count}장`;
  return `보급권 3종 각 ${r.perSlot}장`;
}

export function CheckinCalendar({
  initialDayProgress,
  initialLastClaimedKstDay,
  initialTotalClaimedCount,
  kstToday,
}: {
  initialDayProgress: number;
  initialLastClaimedKstDay: string | null;
  initialTotalClaimedCount: number;
  kstToday: string;
}) {
  const [dayProgress, setDayProgress] = useState(initialDayProgress);
  const [lastClaimed, setLastClaimed] = useState<string | null>(initialLastClaimedKstDay);
  const [total, setTotal] = useState(initialTotalClaimedCount);
  const [pending, startTransition] = useTransition();
  const { showResource, showError } = useResourceToast();

  const claimedToday = lastClaimed === kstToday;
  const todayCellDay = nextCheckinDay1Indexed(dayProgress);
  const todayReward = CHECKIN_CALENDAR[todayCellDay - 1]!;
  const todaySummary = rewardSummary(todayReward);

  const onClaim = () => {
    if (claimedToday || pending) return;
    startTransition(async () => {
      const r = await claimCheckinAction();
      if (r.status !== 'success') {
        showError(r.message);
        return;
      }
      const reward = r.result.reward;
      // 토스트 — 다이아 / 보급권 / 보급권 3종 분기
      if (reward.kind === 'diamond') {
        showResource('💎', '다이아', reward.amount);
      } else if (reward.kind === 'supply') {
        showResource(SLOT_EMOJI[reward.slot], `${SLOT_LABEL[reward.slot]} 보급권`, reward.count);
      } else {
        for (const s of SUPPLY_SLOTS) {
          showResource(SLOT_EMOJI[s], `${SLOT_LABEL[s]} 보급권`, reward.perSlot);
        }
      }
      // 낙관적 갱신 — 다음 사이클 첫칸이면 dp=0
      setDayProgress((dp) => (dp + 1) % CHECKIN_CYCLE_DAYS);
      setLastClaimed(kstToday);
      setTotal((t) => t + 1);
    });
  };

  return (
    <div className="space-y-4">
      {/* 진척 헤더 */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">
          <span aria-hidden>⚡ </span>출석 캘린더
        </h1>
        <div className="text-xs text-zinc-500">
          누적 {total.toLocaleString('ko-KR')}회 · 사이클 {dayProgress}/{CHECKIN_CYCLE_DAYS}
        </div>
      </div>

      {/* 4×7 그리드 */}
      <div className="grid grid-cols-7 gap-1.5">
        {CHECKIN_CALENDAR.map((r, idx) => {
          const day = idx + 1; // 1-index
          const isMilestone = isCheckinMilestone(day);
          const isClaimed = day <= dayProgress; // dp 직전 칸까지 수령
          const isToday = day === todayCellDay && !claimedToday;
          const isTodayClaimed = day === todayCellDay && claimedToday;
          const sum = rewardSummary(r);

          const borderCls = isMilestone
            ? 'border-amber-500/70 ring-1 ring-amber-400/30'
            : 'border-zinc-200 dark:border-zinc-800';
          const stateCls = isToday
            ? 'bg-amber-500/15 dark:bg-amber-400/10 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.55)]'
            : isClaimed || isTodayClaimed
              ? 'bg-zinc-100 opacity-50 dark:bg-zinc-900'
              : 'bg-white dark:bg-zinc-950';

          return (
            <div
              key={day}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border ${borderCls} ${stateCls} px-1 py-1 text-center`}
            >
              <div className={`text-[9px] font-medium ${isMilestone ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                {isMilestone ? '★' : ''}D{day}
              </div>
              <div className="text-base leading-none" aria-hidden>
                {sum.emoji}
              </div>
              <div className={`mt-0.5 text-[9px] leading-tight ${sum.tone === 'dia' ? 'text-sky-700 dark:text-sky-300' : 'text-zinc-600 dark:text-zinc-400'}`}>
                {sum.primary}
              </div>
              {(isClaimed || isTodayClaimed) && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-base text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 오늘 카드 + 액션 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-xs text-zinc-500">
          {claimedToday ? '오늘 수령 완료' : `오늘 (D${todayCellDay}${isCheckinMilestone(todayCellDay) ? ' · 마일스톤 ★' : ''})`}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>{todaySummary.emoji}</span>
          <div className="flex-1">
            <div className="text-base font-semibold">{rewardLongLabel(todayReward)}</div>
            <div className="text-[11px] text-zinc-400">
              {claimedToday ? 'KST 자정 이후 다음 칸 활성화' : '오늘 1회 수령'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClaim}
          disabled={claimedToday || pending}
          className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {claimedToday ? '수령 완료 · 자정 이후 충전' : pending ? '수령 중…' : '오늘 수령'}
        </button>
      </section>

      <p className="text-center text-[10px] text-zinc-400">
        누적 출석 — 끊겨도 자리 유지. 28칸 완료 후 다음 접속일 1칸으로 롤.
      </p>
    </div>
  );
}
