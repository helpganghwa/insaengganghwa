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

  // 진행 요약 — 이번 사이클 수령 수(dayProgress)와 다음 마일스톤까지 남은 일수.
  const milestoneDays = CHECKIN_CALENDAR.map((_, i) => i + 1).filter(isCheckinMilestone);
  const nextMilestone = milestoneDays.find((d) => d > dayProgress) ?? null;

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
    <div>
      {/* 상단 배너 — 황실 아카데미, 가로 풀폭(성장패스 패턴). 타이틀 없음. */}
      <div className="relative h-24 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/academy.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/45" />
        {/* 중앙 타이틀 — 대난투 정보 배너와 동일 스타일(text-pixel-outline) */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <h1 className="text-lg font-extrabold text-white text-pixel-outline">출석 캘린더</h1>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
      {/* 출석 그리드 — 7×4(28칸) 솔리드·심플·컴팩트. 수령 완료 칸엔 출석 도장. */}
      <div className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        {/* 진행 요약 — 이번 사이클 수령/총 + 진행바 + 다음 마일스톤까지 */}
        <div className="mb-2 flex items-center gap-2.5 px-0.5">
          <span className="shrink-0 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            이번 사이클{' '}
            <span className="tabular-nums font-bold text-zinc-800 dark:text-zinc-100">
              {dayProgress}/{CHECKIN_CYCLE_DAYS}
            </span>
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
              style={{ width: `${(dayProgress / CHECKIN_CYCLE_DAYS) * 100}%` }}
            />
          </div>
          {nextMilestone && (
            <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              ✦ {nextMilestone - dayProgress}일
            </span>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1" role="list" aria-label="28일 출석 캘린더">
          {CHECKIN_CALENDAR.map((r, idx) => {
            const day = idx + 1;
            const isClaimed = day <= dayProgress;
            const isToday = day === todayCellDay && !claimedToday;
            const justClaimed = justClaimedDay === day;
            const showCheck = isClaimed;
            const state = isToday ? 'today' : isClaimed ? 'past' : 'future';
            const isMs = isCheckinMilestone(day);
            const isGrand = day === CHECKIN_CYCLE_DAYS;

            // 오늘=앰버 강조, 완료=옅은 회색+도장, 마일스톤(미수령)=골드 프레임, 그 외=옅은 그라데이션.
            const stateCls = isToday
              ? 'bg-amber-500/15 dark:bg-amber-400/10 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.6)]'
              : showCheck
                ? 'bg-zinc-100 dark:bg-zinc-900'
                : isMs
                  ? 'bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-500/12 dark:to-amber-500/5'
                  : 'bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900';
            const borderCls = isToday
              ? 'border-amber-400/70 dark:border-amber-400/40'
              : isMs && !showCheck
                ? 'border-amber-300 dark:border-amber-500/40'
                : 'border-zinc-200 dark:border-zinc-800';
            const grandCls =
              isGrand && !showCheck && !isToday
                ? 'shadow-[0_0_0_1px_rgba(245,158,11,0.55),0_1px_6px_rgba(245,158,11,0.3)]'
                : '';

            return (
              <div
                key={day}
                role="listitem"
                aria-label={cellAriaLabel(day, r, state, isMs, isGrand)}
                style={justClaimed ? { animation: 'checkin-glow 700ms ease-out' } : undefined}
                className={`relative flex aspect-square flex-col items-center justify-between rounded border ${borderCls} ${stateCls} ${grandCls} p-0.5 text-center`}
              >
                {isGrand && !showCheck && (
                  <span aria-hidden className="absolute right-0.5 top-0.5 text-[8px] leading-none text-amber-500">
                    ✦
                  </span>
                )}
                <div
                  className={`text-[10px] leading-none font-bold ${isMs && !showCheck ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'} ${showCheck ? 'opacity-30' : ''}`}
                >
                  {day}
                </div>
                <div
                  className={`flex flex-1 items-center justify-center text-[18px] leading-none ${showCheck ? 'opacity-20' : ''}`}
                  aria-hidden
                >
                  <RewardEmoji r={r} />
                </div>
                <div
                  className={`text-[10px] leading-none font-semibold ${showCheck ? 'opacity-30' : ''} ${
                    r.kind === 'diamond'
                      ? 'text-sky-700 dark:text-sky-300'
                      : isMs
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {quantityLabel(r)}
                </div>

                {/* 수령 완료 — 출석 도장 */}
                {showCheck && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl('/sprites/checkin/stamp.png')}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[98%] w-auto -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    style={{
                      imageRendering: 'pixelated',
                      ...(justClaimed ? { animation: 'checkin-stamp 520ms ease-out' } : {}),
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 오늘 카드 + 액션 — 보물상자 배경 위(상단)으로 노출, 콘텐츠는 하단 어둠 영역에 */}
      <section className="relative h-[100px] isolate overflow-hidden rounded-2xl border border-amber-900/30 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/claim.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* 보상=좌상단, 버튼=우하단. 양쪽에 어둠 깔아 텍스트·버튼 가독성 확보 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        {/* 보상(좌상단) ↔ 버튼(우하단) 대각 배치. */}
        <div className="relative flex h-full items-stretch justify-between gap-2.5 px-3.5 pb-3 pt-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 self-start">
            <span className="text-[26px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" aria-hidden>
              <RewardEmoji r={cardReward} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold leading-tight tracking-wide text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                오늘의 보상
              </div>
              <div className="truncate text-base font-extrabold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                {rewardLongLabel(cardReward)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClaim}
            disabled={claimedToday || pending}
            className="shrink-0 self-end rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-600/80 disabled:text-zinc-300"
          >
            {claimedToday ? '오늘 완료' : pending ? '찍는 중…' : '도장 찍기'}
          </button>
        </div>
      </section>
      </div>
    </div>
  );
}
