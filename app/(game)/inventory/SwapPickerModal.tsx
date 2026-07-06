'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { getActiveJobsForSlot, swapEnhanceAction } from '@/app/(game)/enhance/actions';

type ActiveJob = {
  jobId: string;
  userEquipmentId: string;
  completeAtIso: string;
  enhanceLevel: number;
  transcendLevel: number;
  code: string;
  name: string;
  slot: Slot;
};

function remainingLabel(iso: string, nowMs: number): string {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return '완료';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

/**
 * 인벤토리에서 강화 시작 시 슬롯 모두 사용중(SLOT_BUSY)인 경우 — 같은 슬롯의
 * 강화중 인스턴스 1개를 골라 취소 + 새 장비 등록을 단일 트랜잭션(swapEnhanceAction)
 * 으로 교체. 성공 시 모달 닫고 강화 페이지 이동.
 */
export function SwapPickerModal({
  newUserEquipmentId,
  slot,
  onClose,
}: {
  newUserEquipmentId: string;
  slot: Slot;
  onClose: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ActiveJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 전송 실패도 에러 상태로 — reject 방치 시 jobs=null "불러오는 중…" 무한 로딩.
      const r = await getActiveJobsForSlot(slot).catch(
        () => ({ status: 'error', message: '목록을 불러오지 못했어요. 연결을 확인해 주세요.' }) as const,
      );
      if (cancelled) return;
      if (r.status === 'error') {
        setError(r.message);
        setJobs([]);
        return;
      }
      setJobs(r.jobs);
    })();
    return () => {
      cancelled = true;
    };
  }, [slot]);

  function pick(jobId: string) {
    if (pending) return;
    startTransition(async () => {
      const r = await swapEnhanceAction(jobId, newUserEquipmentId);
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      onClose();
      router.push('/enhance');
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="강화 슬롯 교체"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-zinc-950 p-4 text-zinc-100 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold">교체할 강화 선택</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-zinc-200"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <p className="mb-2 text-[11px] leading-snug text-zinc-400">
          같은 슬롯의 강화 슬롯이 모두 사용 중이에요. 교체할 강화를 선택하면 진행 중인 강화를
          취소하고 새 장비를 등록합니다.
        </p>

        {error ? (
          <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {jobs === null ? (
          <p className="py-6 text-center text-xs text-zinc-500">불러오는 중…</p>
        ) : jobs.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">교체 가능한 강화가 없습니다.</p>
        ) : (
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {jobs.map((j) => (
              <li key={j.jobId}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(j.jobId)}
                  className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-[11px] hover:bg-white/10 disabled:opacity-50"
                >
                  <TranscendSprite
                    code={j.code}
                    slot={j.slot}
                    level={j.transcendLevel}
                    size={32}
                    frameless
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{j.name}</div>
                    <div className="text-[10px] text-zinc-400">
                      +{j.enhanceLevel}
                      {j.transcendLevel > 0 ? ` · T${j.transcendLevel}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[10px] text-amber-300">
                    ⏳ {remainingLabel(j.completeAtIso, nowMs)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="mt-3 w-full rounded-xl border border-zinc-700 py-2 text-xs text-zinc-200 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
