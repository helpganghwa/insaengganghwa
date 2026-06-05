'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  CHECKIN_CALENDAR,
  CHECKIN_CYCLE_DAYS,
  SUPPLY_SLOTS,
  isCheckinMilestone,
  nextCheckinDay1Indexed,
  type CheckinReward,
  type SupplySlot,
} from '@/lib/game/balance';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import * as haptic from '@/lib/game/haptic';
import { sounds } from '@/lib/game/sound';

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

/**
 * 보상 종류별 대표 이모지(셀/카드). 3종 보급은 📦 대신 무기/방어구/장신구
 * 이모지를 겹쳐 표현 — 크기는 부모 font-size에 비례(em 단위 오버랩).
 */
function RewardEmoji({ r }: { r: CheckinReward }) {
  if (r.kind === 'diamond') return <>💎</>;
  if (r.kind === 'supply') return <>{SLOT_EMOJI[r.slot]}</>;
  return (
    <span className="inline-flex items-center">
      {SUPPLY_SLOTS.map((s, i) => (
        <span
          key={s}
          className={i === 0 ? '' : '-ml-[0.42em]'}
          style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.35))' }}
        >
          {SLOT_EMOJI[s]}
        </span>
      ))}
    </span>
  );
}

/** 셀 우하단 작은 수량 라벨. */
function quantityLabel(r: CheckinReward): string {
  if (r.kind === 'diamond')
    return r.amount >= 1000
      ? `${(r.amount / 1000).toFixed(r.amount % 1000 === 0 ? 0 : 1)}k`
      : `${r.amount}`;
  if (r.kind === 'supply') return `×${r.count}`;
  return `×${r.perSlot}`;
}

function rewardLongLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return `다이아 ${r.amount.toLocaleString('ko-KR')}`;
  if (r.kind === 'supply') return `${SLOT_LABEL[r.slot]} 보급 상자 ${r.count}개`;
  return `보급 상자 3종 각 ${r.perSlot}개`;
}

function cellAriaLabel(
  day: number,
  r: CheckinReward,
  state: 'past' | 'today' | 'future',
  isMilestone: boolean,
  isGrand: boolean,
) {
  const stateText =
    state === 'today' ? '오늘 수령 가능' : state === 'past' ? '수령 완료' : '미래 칸';
  const tag = isGrand ? '최종 마일스톤' : isMilestone ? '마일스톤' : '';
  return [`${day}일째`, tag, rewardLongLabel(r), stateText].filter(Boolean).join(', ');
}

export function CheckinCalendar({
  initialDayProgress,
  initialLastClaimedKstDay,
  kstToday,
}: {
  initialDayProgress: number;
  initialLastClaimedKstDay: string | null;
  kstToday: string;
}) {
  const [dayProgress, setDayProgress] = useState(initialDayProgress);
  const [lastClaimed, setLastClaimed] = useState<string | null>(initialLastClaimedKstDay);
  const [pending, startTransition] = useTransition();
  const [justClaimedDay, setJustClaimedDay] = useState<number | null>(null);
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust: adjustDiamond } = useDiamond();

  const claimedToday = lastClaimed === kstToday;
  const todayCellDay = nextCheckinDay1Indexed(dayProgress);
  // 카드 표시 보상 — 오늘 도장 찍었으면 방금 받은 칸(todayCellDay는 내일을 가리킴), 아니면 오늘 칸.
  const cardDay = claimedToday
    ? ((todayCellDay - 2 + CHECKIN_CYCLE_DAYS) % CHECKIN_CYCLE_DAYS) + 1
    : todayCellDay;
  const cardReward = CHECKIN_CALENDAR[cardDay - 1]!;

  useEffect(() => {
    if (justClaimedDay === null) return;
    const t = setTimeout(() => setJustClaimedDay(null), 800);
    return () => clearTimeout(t);
  }, [justClaimedDay]);

  const onClaim = () => {
    if (claimedToday || pending) return;
    startTransition(async () => {
      const r = await claimCheckinAction();
      if (r.status !== 'success') {
        showError(r.message);
        return;
      }
      const reward = r.result.reward;
      const claimedDay = r.result.cycleDay;
      sounds.rewardClaim();
      haptic.success();
      // 보상 종류별 칩 구성 → 공용 헤더 토스트 한 번으로 통합(이전엔 종류마다 중앙 토스트).
      const rewards: HeaderReward[] =
        reward.kind === 'diamond'
          ? [{ icon: '💎', amount: reward.amount }]
          : reward.kind === 'supply'
            ? [{ icon: SLOT_EMOJI[reward.slot], amount: reward.count }]
            : SUPPLY_SLOTS.map((s) => ({ icon: SLOT_EMOJI[s], amount: reward.perSlot }));
      // 헤더 다이아 즉시 가산(낙관) — 페이지가 router.refresh 안 부르므로 필수.
      if (reward.kind === 'diamond') adjustDiamond(BigInt(reward.amount));
      showHeaderToast({ title: '출석 보상', rewards });
      setDayProgress((dp) => (dp + 1) % CHECKIN_CYCLE_DAYS);
      setLastClaimed(kstToday);
      setJustClaimedDay(claimedDay);
    });
  };

  return (
    <div className="space-y-4">
      {/* 4×7 그리드 — emoji + CSS */}
      <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="28일 출석 캘린더">
        {CHECKIN_CALENDAR.map((r, idx) => {
          const day = idx + 1;
          const isMilestone = isCheckinMilestone(day);
          const isGrand = day === CHECKIN_CYCLE_DAYS;
          const isClaimed = day <= dayProgress;
          // 오늘 수령 후 todayCellDay는 '내일 칸'을 가리킴 → 체크/오늘강조 모두 안 함.
          // (이전 isTodayClaimed가 다음 칸을 수령완료로 오표시하던 버그 수정 2026-06-01)
          const isToday = day === todayCellDay && !claimedToday;
          const justClaimed = justClaimedDay === day;
          const showCheck = isClaimed;
          const state = isToday ? 'today' : isClaimed ? 'past' : 'future';

          const borderCls = isGrand
            ? 'border-amber-500 ring-2 ring-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.35)]'
            : isMilestone
              ? 'border-amber-500/70 ring-1 ring-amber-400/30'
              : 'border-zinc-200 dark:border-zinc-800';
          const stateCls = isToday
            ? 'bg-amber-500/15 dark:bg-amber-400/10 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.55)]'
            : showCheck
              ? 'bg-zinc-100 dark:bg-zinc-900'
              : 'bg-white dark:bg-zinc-950';

          return (
            <div
              key={day}
              role="listitem"
              aria-label={cellAriaLabel(day, r, state, isMilestone, isGrand)}
              style={justClaimed ? { animation: 'checkin-glow 700ms ease-out' } : undefined}
              className={`relative flex aspect-square flex-col items-center justify-between rounded-md border ${borderCls} ${stateCls} p-0.5 text-center`}
            >
              <div
                className={`text-[9px] leading-none font-bold ${
                  isGrand
                    ? 'text-amber-700 dark:text-amber-300'
                    : isMilestone
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-400'
                } ${showCheck ? 'opacity-50' : ''}`}
              >
                {isGrand ? '최종' : `${day}`}
              </div>

              <div
                className={`flex flex-1 items-center justify-center text-base leading-none ${
                  showCheck ? 'opacity-40' : ''
                }`}
                aria-hidden
              >
                <RewardEmoji r={r} />
              </div>

              <div
                className={`text-[9px] leading-none font-semibold ${
                  showCheck ? 'opacity-50' : ''
                } ${
                  r.kind === 'diamond'
                    ? 'text-sky-700 dark:text-sky-300'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {quantityLabel(r)}
              </div>

              {showCheck && (
                <div
                  className="pointer-events-none absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] leading-none font-bold text-white shadow-sm"
                  style={justClaimed ? { animation: 'checkin-stamp 520ms ease-out' } : undefined}
                  aria-hidden
                >
                  ✓
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 오늘 카드 + 액션 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            <RewardEmoji r={cardReward} />
          </span>
          <div className="flex-1">
            <div className="text-base font-semibold">{rewardLongLabel(cardReward)}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClaim}
          disabled={claimedToday || pending}
          className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {claimedToday ? '오늘 도장 완료' : pending ? '도장 찍는 중…' : '출석 도장 찍기'}
        </button>
      </section>
    </div>
  );
}
