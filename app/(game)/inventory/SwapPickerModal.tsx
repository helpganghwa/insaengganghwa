'use client';

import { useEffect, useState, useTransition } from 'react';

import { Ticker } from '@/components/Ticker';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { getActiveJobsForSlot, swapEnhanceAction } from '@/app/(game)/enhance/actions';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

type ActiveJob = {
  jobId: string;
  userEquipmentId: string;
  completeAtIso: string;
  startedAtIso: string;
  enhanceLevel: number;
  transcendLevel: number;
  code: string;
  name: string;
  slot: Slot;
};

/** 진행한 시간 — 교체 시 버려지는 값이라 남은 시간보다 이쪽이 판단에 쓰인다. */
function elapsedLabel(startedIso: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - Date.parse(startedIso));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

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
  /** 교체 확인 대상 — 고르는 즉시 취소하지 않고 한 번 되묻는다. */
  const [swapAsk, setSwapAsk] = useState<ActiveJob | null>(null);
  // 1초 클럭은 표시 지점 Ticker가 보유(2026-08-07) — 이전엔 모달 전체가 매초 리렌더.

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

  // 목록이 오기 전에 열면 높이가 튄다 — 데이터가 준비된 뒤에 그린다(에러는 보여줘야 함).
  if (jobs === null && !error) return null;

  return (
    <ModalShell
      onClose={() => (swapAsk ? setSwapAsk(null) : onClose())}
      onSubmit={swapAsk ? () => pick(swapAsk.jobId) : undefined}
      label="강화 슬롯 교체"
    >
      <ModalLayout
        title={swapAsk ? '이 강화를 취소할까요?' : '교체할 강화 선택'}
        subtitle={
          swapAsk ? null : (
            <>
              슬롯이 모두 사용 중 ·{' '}
              <span className="font-bold text-amber-600 dark:text-amber-400">선택 시 진행 취소</span>
            </>
          )
        }
        bodyPad="sm"
        footer={
          swapAsk ? (
            <>
              <ModalButton tone="ghost" onClick={() => setSwapAsk(null)} disabled={pending}>
                뒤로
              </ModalButton>
              <ModalButton tone="danger" onClick={() => pick(swapAsk.jobId)} disabled={pending}>
                취소하고 교체
              </ModalButton>
            </>
          ) : (
            <ModalButton tone="ghost" onClick={onClose}>
              취소
            </ModalButton>
          )
        }
      >

        {error ? (
          <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {jobs === null || jobs.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">교체 가능한 강화가 없어요.</p>
        ) : swapAsk ? (
          // 선택 즉시 취소되던 것을 한 단계 확인으로 감싼다 — 쌓인 강화 시간이 사라지는 동작이라
          // 같은 파괴를 막고 있는 강화 취소 팝업과 보호 수준을 맞춘다(2026-07-29 점검).
          <div className="text-center">
            <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              <b className="font-bold text-zinc-700 dark:text-zinc-200">{swapAsk.name}</b> +
              {swapAsk.enhanceLevel} 강화를 취소하고 새 장비를 등록합니다.
            </p>
            <p className="mt-2 text-[11.5px] font-bold text-amber-600 dark:text-amber-300/90">
              쌓인 시간 <Ticker>{(now) => elapsedLabel(swapAsk.startedAtIso, now)}</Ticker>이 사라지고, 시간 단축에 쓴 다이아는 돌려받을 수 없습니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {jobs.map((j) => (
              <li key={j.jobId}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setSwapAsk(j)}
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
                    ⏳ <Ticker>{(now) => elapsedLabel(j.startedAtIso, now)}</Ticker> 진행
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalLayout>
    </ModalShell>
  );
}
