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
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';

import { finalizeEnhance, reduceTimeWithGems, cancelEnhanceAction } from './actions';

/** §10 자랑 자동 트리거 강화 단계(GDD §6 / 사용자 확정 델타). */
const BOAST_LEVELS = new Set([30, 50, 99]);

export type ActiveJob = {
  jobId: string;
  code: string;
  name: string;
  slot: Slot;
  fromLevel: number;
  targetLevel: number;
  transcendLevel: number;
  isChampion: boolean;
  baseRateBp: number;
  startedAtIso: string;
  completeAtIso: string;
};

type Outcome = 'success' | 'hold' | 'down';
// 결과 문구 — 판타지 톤, 각 outcome당 5개 랜덤 노출(시도마다 분위기 변주).
const OUTCOME_MSGS: Record<Outcome, readonly string[]> = {
  success: [
    '대장간이 환호한다 — 한 계단 위로!',
    '망치질 한 번에 별이 깃들었다',
    '쿵! 강철에 새 결이 새겨졌다',
    '운명의 한 방 — 진화 성공',
    '딱 한 끗, 그 한 끗이 진화다',
  ],
  hold: [
    '어이쿠 손이 미끄러졌네 — 하지만 장비는 무사하다구!',
    '강철은 의리가 있다 — 단계는 그대로',
    '아쉽다, 단단함이 단계를 지켜냈다',
    '쇠가 단단히 굳었다 — 다음을 노리자',
    '망치가 빗나갔지만 장비는 견뎠다',
  ],
  down: [
    '저런… 무너지는 소리가 들린다',
    '균열이 한 줄, 단계가 한 줄 깎였다',
    '쇠가 비명을 질렀다 — 한 단계 하락',
    '운명이 비웃는다 — 강철이 깎였다',
    '망치질이 어긋났다, 단계가 무너졌다',
  ],
} as const;
// 확인 모드 문구 — ready/early 각 5개.
const CONFIRM_MSGS_READY = [
  '다시 탭하면 강화',
  '망치를 들었다 — 다시 탭',
  '준비 완료 — 다시 탭하면 시작',
  '대장간이 기다린다 — 다시 탭',
  '한 번 더 — 시작 신호다',
] as const;
const CONFIRM_MSGS_EARLY = [
  '아직 무르익지 않았다 — 다시 탭하면 강행',
  '서두를 텐가? 다시 탭하면 강화',
  '확률이 미약하다 — 다시 탭이면 강행',
  '운명을 시험할 텐가? 다시 탭',
  '쇠가 아직 차다 — 다시 탭하면 시도',
] as const;
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
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
  const [confirmLeft, setConfirmLeft] = useState(0); // 확인 카운트다운(초). 0=비활성/만료.
  const [flash, setFlash] = useState<Outcome | null>(null);
  const [boast, setBoast] = useState(false);
  const [optimisticDone, setOptimisticDone] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmCancelLeft, setConfirmCancelLeft] = useState(0);
  const [confirmReduce, setConfirmReduce] = useState(false);
  const [confirmReduceLeft, setConfirmReduceLeft] = useState(0);
  const [flashMsg, setFlashMsg] = useState<string | null>(null); // outcome 랜덤 메시지
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null); // 확인 랜덤 메시지

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setOptimisticDone(false);
    setConfirm(false);
  }, [activeJob.jobId]);
  // 확인 모드 진입 시 3초 카운트다운 + 랜덤 메시지 선택(client-only — SSR 안전).
  useEffect(() => {
    if (!confirm) {
      setConfirmLeft(0);
      setConfirmMsg(null);
      return;
    }
    setConfirmLeft(3);
    setConfirmMsg(pick(ready ? CONFIRM_MSGS_READY : CONFIRM_MSGS_EARLY));
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // ready를 deps에 안 넣음 — 진입 시점의 ready 메시지를 카운트 동안 고정(자연).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);
  // 취소·다이아 단축 — 동일 3s 재탭 패턴(카운트 라벨 노출용 useEffect).
  useEffect(() => {
    if (!confirmCancel) {
      setConfirmCancelLeft(0);
      return;
    }
    setConfirmCancelLeft(3);
    const id = setInterval(() => {
      setConfirmCancelLeft((s) => {
        if (s <= 1) {
          setConfirmCancel(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirmCancel]);
  useEffect(() => {
    if (!confirmReduce) {
      setConfirmReduceLeft(0);
      return;
    }
    setConfirmReduceLeft(3);
    const id = setInterval(() => {
      setConfirmReduceLeft((s) => {
        if (s <= 1) {
          setConfirmReduce(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirmReduce]);

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
      // 결과 트랜잭션 커밋 즉시 반환(후처리는 서버 after). 이 await만 pending.
      const r = await finalizeEnhance(activeJob.jobId);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      const oc = r.result.outcome as Outcome;
      setFlash(oc); // 결과 즉시 표시
      setFlashMsg(pick(OUTCOME_MSGS[oc])); // 판타지 톤 5개 중 랜덤
      // §10 자랑 — +30/+50/+99 강화 성공 시 공유 모달.
      if (oc === 'success' && BOAST_LEVELS.has(activeJob.targetLevel)) {
        setTimeout(() => setBoast(true), 1600);
      }
      // 새 잡/소진 반영은 축하 연출(1.5s) 후 비차단 reconcile —
      // setTimeout 콜백은 transition 밖이라 pending을 잡지 않음(결과가 빨리 보임).
      setTimeout(() => {
        setFlash(null);
        setFlashMsg(null);
        router.refresh();
      }, 1500);
    });
  };

  const doReduce = () => {
    if (pending || !instantCost || !canAfford) return;
    // 다이아 사용 — 취소와 동일 3s 재탭 패턴(오탭 보호). 카운트다운은 useEffect.
    if (!confirmReduce) {
      setConfirmReduce(true);
      return;
    }
    setConfirmReduce(false);
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
        onClick={() => {
          if (pending || flash) return;
          // 확인 모드: 두 번째 탭 = 강화. 그 외(기본): 첫 탭 = 확인 진입.
          if (confirm) doAttempt();
          else setConfirm(true);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pending && !flash) {
            e.preventDefault();
            if (confirm) doAttempt();
            else setConfirm(true);
          }
        }}
        className={`relative h-[92px] cursor-pointer overflow-hidden rounded-xl border-2 bg-zinc-950 text-zinc-100 transition active:scale-[0.99] ${
          ready ? 'border-emerald-500' : 'border-zinc-700'
        } ${flash ? FLASH_CLASS[flash] : ''} ${pending ? 'opacity-70' : ''}`}
      >
        {/* 진행 게이지 — 하단 바. 색: <50% 빨강 / 50~<100% 주황 / 100% 초록 */}
        <div
          className={`absolute bottom-0 left-0 h-1 transition-[width] duration-700 ${
            ready ? 'bg-emerald-400' : progress >= 0.5 ? 'bg-orange-400' : 'bg-red-500'
          }`}
          style={{ width: `${Math.max(2, Math.round(progress * 1000) / 10)}%` }}
        />
        <div className="flex h-full items-center gap-3 px-3">
          <span
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-black/40 ${
              hasRarityBorder(activeJob.transcendLevel) ? '' : 'border-zinc-700'
            }`}
            style={rarityBorderStyle(activeJob.transcendLevel)}
          >
            <RarityFrame level={activeJob.transcendLevel} />
            <TranscendSprite
              code={activeJob.code}
              slot={activeJob.slot}
              level={activeJob.transcendLevel}
              isChampion={activeJob.isChampion}
              size={60}
              frameless
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap">
              <span className="truncate">{activeJob.name}</span>
              <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                +{activeJob.fromLevel}→+{activeJob.targetLevel}
              </span>
            </div>
            <div className="flex gap-2 text-[11px] font-semibold tabular-nums">
              <span className="text-emerald-300">성공 {(effBp / 100).toFixed(1)}%</span>
              <span className="text-zinc-400">최대 {(activeJob.baseRateBp / 100).toFixed(0)}%</span>
              {isRiskZone ? (
                <span className="text-amber-300">하락 {downPct.toFixed(1)}%</span>
              ) : null}
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
              className={`h-6 w-[54px] rounded-md border text-[9px] font-bold tabular-nums disabled:opacity-40 ${
                confirmReduce
                  ? 'animate-pulse border-amber-300 bg-amber-500 text-white'
                  : 'border-zinc-600 bg-zinc-800/60 text-amber-200'
              }`}
            >
              {confirmReduce ? `확인 ${confirmReduceLeft}s` : instantCost ? `💎${instantCost}` : '완료'}
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
              {confirmCancel ? `확인 ${confirmCancelLeft}s` : '취소'}
            </button>
          </div>
        </div>

        {confirm && !flash ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/85 px-4 text-center">
            <p className="text-[12px] font-semibold break-keep text-amber-200">
              {confirmMsg ?? (ready ? '다시 탭하면 강화' : '아직 무르익지 않았다 — 다시 탭하면 강행')}
            </p>
            <p className="font-mono text-[10px] text-zinc-300 tabular-nums">
              {confirmLeft}s 후 자동 취소
            </p>
          </div>
        ) : null}

        {flash ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/70 px-5 text-center">
            <span className={`text-[11px] font-medium break-keep ${OUTCOME_TONE[flash]}`}>
              {flashMsg ?? OUTCOME_MSGS[flash][0]}
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
            code: activeJob.code,
            name: activeJob.name,
            enhanceLevel: activeJob.targetLevel,
            transcendLevel: activeJob.transcendLevel,
            isChampion: activeJob.isChampion,
          },
          cp: pieceCombatPower(activeJob.targetLevel, activeJob.transcendLevel),
        }}
      />
    </div>
  );
}
