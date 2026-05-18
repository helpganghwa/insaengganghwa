'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  effectiveRateBp,
  diamondToFinishMs,
  pieceCombatPower,
  SAFE_MAX_LEVEL,
  FODDER_REQUIRED_FROM_LEVEL,
} from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';
import { BoastModal } from '@/components/BoastModal';

import { finalizeEnhance, reduceTimeWithGems, cancelEnhanceAction } from './actions';

/** §10 자랑 자동 트리거 강화 단계(GDD §6 / 사용자 확정 델타). */
const BOAST_LEVELS = new Set([30, 50, 99]);

export type ActiveJob = {
  jobId: string;
  name: string;
  slot: Slot;
  fromLevel: number;
  targetLevel: number;
  transcendLevel: number;
  baseRateBp: number;
  startedAtIso: string;
  completeAtIso: string;
};

type Outcome = 'success' | 'hold' | 'down';
const OUTCOME_MSG: Record<Outcome, string> = {
  success: '강화 성공! 한 단계 진화했다',
  hold: '실패… 하지만 단계는 유지됐다',
  down: '실패 — 한 단계 하락했다',
};
const OUTCOME_TONE: Record<Outcome, string> = {
  success: 'text-emerald-300',
  hold: 'text-zinc-200',
  down: 'text-amber-300',
};
const FLASH_CLASS: Record<Outcome, string> = {
  success: 'animate-flash-success',
  hold: 'animate-flash-hold',
  down: 'animate-flash-down',
};

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '완료';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

export function EnhanceSlotCard({
  activeJob,
  diamond,
  nickname,
}: {
  activeJob: ActiveJob;
  diamond: string;
  nickname: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(0); // SSR 매칭 위해 0 → mount 후 동기화
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState<Outcome | null>(null);
  const [boast, setBoast] = useState(false);
  const [optimisticDone, setOptimisticDone] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOptimisticDone(false);
    setConfirm(false);
  }, [activeJob.jobId]);

  const startMs = new Date(activeJob.startedAtIso).getTime();
  const endMs = new Date(activeJob.completeAtIso).getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const done = optimisticDone;
  const elapsedMs = done ? totalMs : Math.max(0, Math.min(totalMs, nowMs - startMs));
  const progress = done ? 1 : nowMs === 0 ? 0 : elapsedMs / totalMs;
  const remainingMs = done ? 0 : Math.max(0, endMs - nowMs);
  const ready = progress >= 1;

  const effBp = effectiveRateBp(activeJob.baseRateBp, elapsedMs, totalMs);
  const isRiskZone = activeJob.fromLevel > SAFE_MAX_LEVEL; // +52~ 실패 시 하락
  const needsFodder = activeJob.fromLevel >= FODDER_REQUIRED_FROM_LEVEL;
  const downPct = isRiskZone ? (1 - effBp / 10000) * 100 : 0;

  const instantCost = remainingMs > 0 ? diamondToFinishMs(remainingMs) : 0;
  const canAfford = BigInt(diamond) >= BigInt(instantCost || 0);

  const doAttempt = () => {
    if (pending) return;
    setConfirm(false);
    startTransition(async () => {
      const r = await finalizeEnhance(activeJob.jobId);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      const oc = r.result.outcome as Outcome;
      setFlash(oc);
      setTimeout(() => setFlash(null), 1500);
      // §10 자랑 — +30/+50/+99 강화 성공 시 공유 모달.
      if (oc === 'success' && BOAST_LEVELS.has(activeJob.targetLevel)) {
        setTimeout(() => setBoast(true), 1500);
      }
      router.refresh();
    });
  };

  const doReduce = () => {
    if (pending || !instantCost || !canAfford) return;
    setOptimisticDone(true);
    startTransition(async () => {
      const r = await reduceTimeWithGems(activeJob.jobId, instantCost);
      if (r.status === 'error') {
        setOptimisticDone(false);
        alert(r.message);
      } else router.refresh();
    });
  };

  const doCancel = () => {
    if (pending) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      setTimeout(() => setConfirmCancel(false), 3000);
      return;
    }
    startTransition(async () => {
      const r = await cancelEnhanceAction(activeJob.jobId);
      setConfirmCancel(false);
      if (r.status === 'error') alert(r.message);
      else router.refresh();
    });
  };

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={pending ? -1 : 0}
        aria-label={`강화 시도 — 현재 성공률 ${(effBp / 100).toFixed(1)}%`}
        onClick={() => !pending && !confirm && setConfirm(true)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pending) {
            e.preventDefault();
            setConfirm(true);
          }
        }}
        className={`relative h-[92px] cursor-pointer overflow-hidden rounded-xl border-2 bg-zinc-950 text-zinc-100 transition active:scale-[0.99] ${
          ready ? 'border-emerald-500' : 'border-zinc-700'
        } ${flash ? FLASH_CLASS[flash] : ''} ${pending ? 'opacity-70' : ''}`}
      >
        {/* 진행 게이지 — 하단 바 (테두리형 SVG 게이지는 후속 비주얼 폴리시) */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-emerald-400 transition-[width] duration-700"
          style={{ width: `${Math.max(2, Math.round(progress * 1000) / 10)}%` }}
        />
        <div className="flex h-full items-center gap-3 px-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-black/40 text-xl">
            ⚒️
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold">
              <span className="truncate">{activeJob.name}</span>
              <span className="shrink-0 rounded bg-amber-900/60 px-1 text-[10px] text-amber-200">
                ✦T{activeJob.transcendLevel}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                +{activeJob.fromLevel}→+{activeJob.targetLevel}
              </span>
            </div>
            <div className="flex gap-2 text-[11px] font-semibold tabular-nums">
              <span className="text-emerald-300">성공 {(effBp / 100).toFixed(1)}%</span>
              <span className="text-zinc-400">공시 {(activeJob.baseRateBp / 100).toFixed(0)}%</span>
              {isRiskZone ? (
                <span className="text-amber-300">하락 {downPct.toFixed(1)}%</span>
              ) : (
                <span className="text-zinc-500">안전(유지)</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 tabular-nums">
              {pending
                ? '처리 중…'
                : ready
                  ? '강화 가능 (최대 확률)'
                  : `최대 확률까지 ${fmtRemaining(remainingMs)}`}
              {needsFodder ? ' · 제물 1 소모' : ''}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              disabled={pending || !instantCost || !canAfford}
              onClick={(e) => {
                e.stopPropagation();
                doReduce();
              }}
              className="h-6 w-[54px] rounded-md border border-zinc-600 bg-zinc-800/60 text-[9px] font-bold text-amber-200 tabular-nums disabled:opacity-40"
            >
              {instantCost ? `💎${instantCost}` : '완료'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                doCancel();
              }}
              className={`h-6 w-[54px] rounded-md border text-[9px] font-bold tabular-nums disabled:opacity-40 ${
                confirmCancel
                  ? 'animate-pulse border-red-400 bg-red-500 text-white'
                  : 'border-zinc-600 bg-zinc-800/60 text-zinc-200'
              }`}
            >
              {confirmCancel ? '확정?' : '취소'}
            </button>
          </div>
        </div>

        {confirm && !flash ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 px-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold break-keep text-amber-200">
              {ready
                ? '강화하시겠습니까?'
                : '아직 최대 확률이 아닙니다. 그래도 강화하시겠습니까?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doAttempt}
                className="h-7 rounded-md bg-amber-500 px-3 text-[11px] font-bold text-amber-950"
              >
                강화
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="h-7 rounded-md border border-zinc-500 px-3 text-[11px] font-bold text-zinc-200"
              >
                취소
              </button>
            </div>
          </div>
        ) : null}

        {flash ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/70 px-5 text-center">
            <span className={`text-[11px] font-medium break-keep ${OUTCOME_TONE[flash]}`}>
              {OUTCOME_MSG[flash]}
            </span>
          </span>
        ) : null}
      </div>

      <BoastModal
        open={boast}
        onClose={() => setBoast(false)}
        nickname={nickname}
        kind="piece"
        headline={`✨ +${activeJob.targetLevel} 강화 달성`}
        piece={{
          p: {
            slot: activeJob.slot,
            name: activeJob.name,
            enhanceLevel: activeJob.targetLevel,
            transcendLevel: activeJob.transcendLevel,
          },
          cp: pieceCombatPower(activeJob.targetLevel, activeJob.transcendLevel),
        }}
      />
    </div>
  );
}
