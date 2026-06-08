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
import { assetUrl } from '@/lib/asset-versions';
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

/** 보상 종류별 대표 이모지(셀/카드) — 다이아·단일 슬롯·3종 보급(📦). */
function RewardEmoji({ r }: { r: CheckinReward }) {
  if (r.kind === 'diamond') return <>💎</>;
  if (r.kind === 'supply') return <>{SLOT_EMOJI[r.slot]}</>;
  return <>📦</>;
}

/** 셀 우하단 작은 수량 라벨. */
function quantityLabel(r: CheckinReward): string {
  if (r.kind === 'diamond')
    return r.amount >= 1000
      ? `${(r.amount / 1000).toFixed(r.amount % 1000 === 0 ? 0 : 1)}k`
      : `${r.amount}`;
  if (r.kind === 'supply') return `×${r.count}`;
  // 📦 = 종류 섞인 보급 상자(총 개수 기준). supply_set은 3슬롯 각 perSlot → 총 perSlot×3.
  return `×${r.perSlot * SUPPLY_SLOTS.length}`;
}

function rewardLongLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return `다이아 ${r.amount.toLocaleString('ko-KR')}`;
  if (r.kind === 'supply') return `${SLOT_LABEL[r.slot]} 보급 상자 ${r.count}개`;
  return `보급 상자 ${r.perSlot * SUPPLY_SLOTS.length}개(무기·방어구·장신구 각 ${r.perSlot}개)`;
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
      {/* 출석판 — 책상 텍스처 배경 위에 4×7 그리드(셀은 반투명으로 나뭇결이 비침) */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-900/30 p-4 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/board.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div
          className="relative grid grid-cols-7 gap-1.5"
          role="list"
          aria-label="28일 출석 캘린더"
        >
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
          // 셀 반투명 — 출석판(나뭇결) 배경이 비치도록.
          const stateCls = isToday
            ? 'bg-amber-500/30 dark:bg-amber-400/20 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.6)]'
            : showCheck
              ? 'bg-zinc-100/70 dark:bg-zinc-900/65'
              : 'bg-white/82 dark:bg-zinc-950/65';

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
                className={`flex flex-1 items-center justify-center text-[13px] leading-none ${
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
      </div>

      {/* 오늘 카드 + 액션 — 보물상자 배경 위(상단)으로 노출, 콘텐츠는 하단 어둠 영역에 */}
      <section className="relative h-[132px] overflow-hidden rounded-2xl border border-amber-900/30 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/claim.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="relative flex h-full flex-col justify-end gap-2 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" aria-hidden>
              <RewardEmoji r={cardReward} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                오늘의 보상
              </div>
              <div className="truncate text-[13px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {rewardLongLabel(cardReward)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClaim}
            disabled={claimedToday || pending}
            className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-600/80 disabled:text-zinc-300"
          >
            {claimedToday ? '오늘 도장 완료' : pending ? '도장 찍는 중…' : '출석 도장 찍기'}
          </button>
        </div>
      </section>
    </div>
  );
}
