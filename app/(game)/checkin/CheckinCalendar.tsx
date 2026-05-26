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
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';
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

/** Pixellab pixflux 64×64 보상 타일 파일명(public/sprites/checkin/). */
function tileFile(r: CheckinReward): string {
  if (r.kind === 'supply') return `tile-${r.slot}.png`;
  if (r.kind === 'supply_set') return r.perSlot >= 20 ? 'tile-chest-lg.png' : 'tile-chest-sm.png';
  if (r.amount >= 5000) return 'tile-gem-grand.png';
  if (r.amount >= 2000) return 'tile-gem-md.png';
  return 'tile-gem-sm.png';
}

/** 칸 우하단 작은 수량 라벨. */
function quantityLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return r.amount >= 1000 ? `${(r.amount / 1000).toFixed(r.amount % 1000 === 0 ? 0 : 1)}k` : `${r.amount}`;
  if (r.kind === 'supply') return `×${r.count}`;
  return `×${r.perSlot}`;
}

function rewardLongLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return `다이아 ${r.amount.toLocaleString('ko-KR')}`;
  if (r.kind === 'supply') return `${SLOT_LABEL[r.slot]} 보급권 ${r.count}장`;
  return `보급권 3종 각 ${r.perSlot}장`;
}

function cellAriaLabel(
  day: number,
  r: CheckinReward,
  state: 'past' | 'today' | 'today_done' | 'future',
  isMilestone: boolean,
  isGrand: boolean,
) {
  const stateText =
    state === 'today'
      ? '오늘 수령 가능'
      : state === 'today_done' || state === 'past'
        ? '수령 완료'
        : '미래 칸';
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
  const { showResource, showError } = useResourceToast();

  const claimedToday = lastClaimed === kstToday;
  const todayCellDay = nextCheckinDay1Indexed(dayProgress);
  const todayReward = CHECKIN_CALENDAR[todayCellDay - 1]!;

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
      if (reward.kind === 'diamond') {
        showResource('💎', '다이아', reward.amount);
      } else if (reward.kind === 'supply') {
        showResource(SLOT_EMOJI[reward.slot], `${SLOT_LABEL[reward.slot]} 보급권`, reward.count);
      } else {
        for (const s of SUPPLY_SLOTS) {
          showResource(SLOT_EMOJI[s], `${SLOT_LABEL[s]} 보급권`, reward.perSlot);
        }
      }
      setDayProgress((dp) => (dp + 1) % CHECKIN_CYCLE_DAYS);
      setLastClaimed(kstToday);
      setJustClaimedDay(claimedDay);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">
          <span aria-hidden>⚡ </span>출석 캘린더
        </h1>
      </div>

      {/* 4×7 그리드 — 나무 판뎍 배경 위에 보상 타일 28칸 */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-900/60 shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/grid-bg.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/15" />
        <div
          className="relative z-10 grid grid-cols-7 gap-1.5 p-2.5"
          role="list"
          aria-label="28일 출석 캘린더"
        >
          {CHECKIN_CALENDAR.map((r, idx) => {
            const day = idx + 1;
            const isMilestone = isCheckinMilestone(day);
            const isGrand = day === CHECKIN_CYCLE_DAYS;
            const isClaimed = day <= dayProgress;
            const isToday = day === todayCellDay && !claimedToday;
            const isTodayClaimed = day === todayCellDay && claimedToday;
            const justClaimed = justClaimedDay === day;
            const showCheck = isClaimed || isTodayClaimed;
            const state = isToday ? 'today' : isTodayClaimed ? 'today_done' : isClaimed ? 'past' : 'future';

            const borderCls = isGrand
              ? 'border-amber-300 ring-2 ring-amber-300/70 shadow-[0_0_10px_rgba(252,211,77,0.5)]'
              : isMilestone
                ? 'border-amber-300/80 ring-1 ring-amber-300/40'
                : 'border-amber-100/30';
            const stateCls = isToday
              ? 'bg-amber-300/30 shadow-[inset_0_0_0_2px_rgba(252,211,77,0.7)]'
              : showCheck
                ? 'bg-black/40'
                : 'bg-black/25';

            return (
              <div
                key={day}
                role="listitem"
                aria-label={cellAriaLabel(day, r, state, isMilestone, isGrand)}
                style={justClaimed ? { animation: 'checkin-glow 700ms ease-out' } : undefined}
                className={`relative flex aspect-square flex-col items-center justify-between rounded-md border ${borderCls} ${stateCls} backdrop-blur-[1px] p-0.5 text-center`}
              >
                {/* 상단 D라벨 */}
                <div
                  className={`text-[8px] leading-none font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                    isGrand
                      ? 'text-amber-200'
                      : isMilestone
                        ? 'text-amber-300'
                        : 'text-amber-100/80'
                  }`}
                >
                  {isGrand ? 'GRAND' : isMilestone ? `★${day}` : `${day}`}
                </div>

                {/* 보상 타일(64×64 픽셀아트) */}
                <div className={`flex flex-1 items-center justify-center ${showCheck ? 'opacity-40' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(`/sprites/checkin/${tileFile(r)}`)}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                {/* 우하단 수량 라벨 */}
                <div
                  className={`text-[8px] leading-none font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                    showCheck ? 'opacity-40' : ''
                  } ${r.kind === 'diamond' ? 'text-sky-200' : 'text-amber-100'}`}
                >
                  {quantityLabel(r)}
                </div>

                {showCheck && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-bold text-amber-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
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

      {/* 오늘 카드 + 액션 (양피지 버튼) */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-xs text-zinc-500">
          {claimedToday
            ? '오늘 수령 완료'
            : `오늘 (D${todayCellDay}${
                todayCellDay === CHECKIN_CYCLE_DAYS
                  ? ' · GRAND ★'
                  : isCheckinMilestone(todayCellDay)
                    ? ' · 마일스톤 ★'
                    : ''
              })`}
        </div>
        <div className="mt-1 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(`/sprites/checkin/${tileFile(todayReward)}`)}
            alt=""
            aria-hidden
            draggable={false}
            className="h-12 w-12 object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
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
          className="relative mt-3 flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border border-amber-700/60 shadow-md transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/checkin/button-bg.png')}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
          {claimedToday ? (
            <div className="pointer-events-none absolute inset-0 bg-zinc-950/55" />
          ) : (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-900/10 to-amber-950/25" />
          )}
          <span
            className={`relative z-10 text-sm font-bold drop-shadow-[0_1px_2px_rgba(255,240,200,0.9)] ${
              claimedToday ? 'text-amber-100' : 'text-amber-950'
            }`}
          >
            {claimedToday
              ? '오늘 도장 완료 · 자정 이후 다음 칸'
              : pending
                ? '도장 찍는 중…'
                : '출석 도장 찍기'}
          </span>
        </button>
      </section>
    </div>
  );
}
