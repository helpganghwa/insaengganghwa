'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  CHECKIN_CALENDAR,
  CHECKIN_COMPLETE_BONUS_DIAMOND,
  CHECKIN_CYCLE_DAYS,
  nextCheckinDay1Indexed,
  type CheckinReward,
} from '@/lib/game/balance';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';

import { claimCheckinAction } from './checkin/actions';

/**
 * 출석 자동 팝업(2026-07-22, /checkin 페이지 대체 — B안: 이번 주 + 큰 보상 게이지).
 * 홈 최초 진입 시 오늘 미수령이면 자동 노출, 버튼 하나(받기=수령, X 없음).
 * 공지 팝업·채팅창보다 위(z-[80], 사용자 확정) · 튜토리얼 중엔 홈(page)에서 미노출.
 * 수령 시퀀스: 오늘 칸 ✓ 팝 + 게이지 차오름(700ms) → 헤더 토스트 → 닫힘(사용자 확정).
 * 에러 시에만 닫기 허용(수령 불가 상태로 갇히지 않게).
 */

const fmt = (n: number) => n.toLocaleString('ko-KR');
const kstDay = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 홈 상주 게이트 — 미수령이면 팝업 렌더 + **KST 자정 롤오버 감지**(사용자 지적 2026-07-22):
 * 홈에 머문 채 자정을 넘기거나(타이머), 백그라운드 탭이 자정 후 복귀하면(visibilitychange)
 * router.refresh()로 서버 미수령 상태를 재조회해 팝업이 이동 없이 자동 등장한다.
 * 수령 판정은 서버 KST 가드가 진실이라 이 감지는 표시 트리거일 뿐(정합성 무관).
 */
export function CheckinPopupGate({ unclaimed, dayProgress }: { unclaimed: boolean; dayProgress: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      const kstMs = now + 9 * 3600_000;
      const nextMidnight = (Math.floor(kstMs / 86_400_000) + 1) * 86_400_000 - 9 * 3600_000;
      timer = setTimeout(() => {
        router.refresh();
        arm(); // 다음 자정 재무장(연속 방치 대비)
      }, nextMidnight - now + 5_000); // +5s 버퍼(클럭 오차)
    };
    arm();
    const mountedDay = kstDay();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && kstDay() !== mountedDay) router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);
  if (!unclaimed) return null;
  return <CheckinPopup dayProgress={dayProgress} />;
}
const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;

function rewardIcon(r: CheckinReward, day1: number): string {
  if (r.kind === 'supply_set') return '🎁';
  if (r.kind === 'supply') return SLOT_ICON[r.slot];
  return day1 % 7 === 0 ? '💰' : '💎';
}

function rewardLabel(r: CheckinReward): string {
  if (r.kind === 'diamond') return `💎${fmt(r.amount)}`;
  if (r.kind === 'supply') return `보급 상자 ${r.count}개`; // 슬롯은 이모지(⚔️🛡️💍)가 전달
  return `보급 세트 ${r.perSlot * 3}개`;
}

function rewardToasts(r: CheckinReward): HeaderReward[] {
  if (r.kind === 'diamond') return [{ icon: '💎', amount: r.amount }];
  if (r.kind === 'supply') return [{ icon: SLOT_ICON[r.slot], amount: r.count }];
  return (['weapon', 'armor', 'accessory'] as const).map((s) => ({ icon: SLOT_ICON[s], amount: r.perSlot }));
}

export function CheckinPopup({ dayProgress }: { dayProgress: number }) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const [closed, setClosed] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const day = nextCheckinDay1Indexed(dayProgress); // 오늘 받을 칸(1~28)
  const week = Math.ceil(day / 7); // 1~4
  const mileDay = week * 7; // 이번 주 큰 보상 칸
  const mileLabel = rewardLabel(CHECKIN_CALENDAR[mileDay - 1]!);
  const bonusLabel = `💎${fmt(CHECKIN_COMPLETE_BONUS_DIAMOND)}`; // 완주 보너스(칸 보상과 별도 1회)
  const today = CHECKIN_CALENDAR[day - 1]!;
  // 28일째는 칸 보상 + 완주 보너스가 함께 지급 — 버튼·완료 문구는 합계로 표기(사용자 확정).
  const todayLabel =
    day === CHECKIN_CYCLE_DAYS && today.kind === 'diamond'
      ? `💎${fmt(today.amount + CHECKIN_COMPLETE_BONUS_DIAMOND)}`
      : rewardLabel(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => (week - 1) * 7 + i + 1);
  // 게이지는 "받은 만큼"(수령 전 = 어제까지) — 수령 순간 오늘 몫이 차오르는 연출.
  const filled = claimed ? day : day - 1;

  if (closed) return null;

  const claim = () => {
    setError(null);
    // 낙관적 업데이트(사용자 확정) — 응답을 기다리지 않고 ✓ 팝 + 게이지 fill을 즉시 시작.
    // 실패 시 되돌리고 에러 표시. 토스트(보상 확정 통지)만 서버 성공 후 발화 — 시퀀스
    // 타이밍은 클릭 시점 기준(t0)이라 서버 지연이 연출 길이를 늘리지 않는다.
    const t0 = Date.now();
    setClaimed(true);
    startTransition(async () => {
      const res = await claimCheckinAction();
      const elapsed = Date.now() - t0;
      if (res.status === 'success') {
        setTimeout(() => {
          showHeaderToast({
            title: `출석 ${day}일째 보상 획득!`,
            rewards: (() => {
              const rows = rewardToasts(res.result.reward);
              const bonus = res.result.completeBonusDiamond;
              if (bonus > 0) {
                const dia = rows.find((x) => x.icon === '💎');
                if (dia) dia.amount += bonus;
                else rows.push({ icon: '💎', amount: bonus });
              }
              return rows;
            })(),
          });
        }, Math.max(0, 1100 - elapsed));
        setTimeout(() => {
          setClosed(true);
          router.refresh(); // 헤더 다이아·도전과제·배너 갱신
        }, Math.max(600, 2600 - elapsed));
      } else if (res.code === 'CHECKIN_ALREADY_CLAIMED') {
        // 다른 탭/기기에서 이미 수령 — 조용히 닫고 동기화.
        setClosed(true);
        router.refresh();
      } else {
        setClaimed(false); // 낙관 롤백
        setError(res.message);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-5 backdrop-blur-sm">
      <div className="w-full max-w-[340px] rounded-2xl border border-amber-800/70 bg-zinc-900 p-4 shadow-2xl shadow-black/60">
        <p className="text-center text-sm font-extrabold text-amber-200">출석 {day}일째</p>
        <p className="mt-0.5 text-center text-[11px] text-zinc-400">
          {week}주 차 — {mileDay}일째 {mileLabel}
        </p>

        {/* 이번 주 7칸 — 6+1 구성(사용자 확정): 평일 6칸 한 줄 + 7일째 큰 보상 풀와이드 강조. */}
        <div className="mt-3 grid grid-cols-6 gap-1">
          {weekDays.map((d) => {
            const r = CHECKIN_CALENDAR[d - 1]!;
            const isToday = d === day;
            const past = d < day;
            const mile = d % 7 === 0;
            const stateCls = isToday
              ? claimed
                ? 'border-emerald-500 bg-emerald-950 text-emerald-300'
                : 'border-amber-400 bg-amber-950 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.35)]'
              : past
                ? 'border-zinc-800 bg-zinc-950 opacity-45'
                : mile
                  ? 'border-violet-500/80 bg-violet-950/40 text-violet-200 shadow-[0_0_8px_rgba(168,85,247,0.25)]'
                  : 'border-zinc-700/60 bg-zinc-800/70 text-zinc-400';
            if (mile) {
              // 마지막 칸 — 풀와이드 큰 보상(강조): 아이콘 + "N일째 큰 보상 · 라벨"
              return (
                <div
                  key={d}
                  className={`col-span-6 flex items-center justify-center gap-2 rounded-xl border py-2 transition-all duration-500 ${stateCls}`}
                >
                  <span className="text-lg leading-none">{isToday && claimed ? '✅' : rewardIcon(r, d)}</span>
                  <span className="text-[11px] font-extrabold">
                    {d}일째 큰 보상 · {rewardLabel(r)}
                  </span>
                  <span className="text-[9px] font-bold opacity-80">
                    {past ? '✓' : isToday ? (claimed ? '완료' : '오늘') : ''}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={d}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2 transition-all duration-500 ${stateCls}`}
              >
                <span className="text-base leading-none">
                  {isToday && claimed ? '✅' : rewardIcon(r, d)}
                </span>
                <span className="text-[10px] font-bold leading-none">
                  {past ? '✓' : isToday ? (claimed ? '완료' : '오늘') : `${d}일`}
                </span>
              </div>
            );
          })}
        </div>

        {/* 게이지 — 다음 큰 보상(마지막 주엔 완주와 동일이라 생략) + 완주 보상. 수령 시 차오름. */}
        <div className="mt-3 space-y-2">
          {mileDay < CHECKIN_CYCLE_DAYS && (
            <div>
              <div className="flex items-baseline justify-between text-[10px] text-zinc-400">
                <span>
                  다음 큰 보상 <b className="text-amber-300">{mileLabel}</b>
                </span>
                <span className="tabular-nums">
                  {filled} / {mileDay}일
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-[width] duration-[1100ms] ease-out"
                  style={{ width: `${Math.round((filled / mileDay) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div>
            <div className="flex items-baseline justify-between text-[10px] text-zinc-400">
              <span>
                28일 완주 보너스 <b className="text-amber-300">{bonusLabel}</b>
              </span>
              <span className="tabular-nums">
                {filled} / {CHECKIN_CYCLE_DAYS}일
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-[width] duration-[1100ms] ease-out"
                style={{ width: `${Math.round((filled / CHECKIN_CYCLE_DAYS) * 100)}%` }}
              />
            </div>
          </div>
          <p className="text-[9px] leading-snug text-zinc-500">완주 보너스는 28일을 모두 채우면 그날 보상에 더해 한 번 더 지급돼요.</p>
        </div>

        {claimed ? (
          <div className="mt-3.5 rounded-xl bg-emerald-950/80 py-2.5 text-center text-sm font-extrabold text-emerald-300">
            {todayLabel} 지급 완료!
          </div>
        ) : (
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="mt-3.5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-2.5 text-center text-sm font-extrabold text-amber-950 active:opacity-90 disabled:opacity-60"
          >
            {pending
              ? '수령 중…'
              : // 다이아는 라벨에 💎가 이미 있어 아이콘 생략(💎 중복 표기 방지).
                `${today.kind === 'diamond' ? '' : `${rewardIcon(today, day)} `}${todayLabel} 받기`}
          </button>
        )}

        {error ? (
          <div className="mt-2 text-center">
            <p className="text-[11px] text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="mt-1 text-[11px] text-zinc-500 underline underline-offset-2"
            >
              닫기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
