'use client';

import { useRouter } from 'next/navigation';
import { josa } from 'josa';
import { useState } from 'react';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { Ticker } from '@/components/Ticker';

import { cancelHostedRaidAction, leaveRaidAction } from './actions';
import type { RaidView } from './RaidSessionCard';

const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 남은 시간 m:ss — 0이면 null(버튼을 숨긴다). */
function leftText(deadlineMs: number, now: number): string | null {
  const s = Math.ceil((deadlineMs - now) / 1000);
  if (s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 레이드 취소 버튼 + 확인 팝업(11-16, 시안 5J85UYsahKUhmiJh8GAYDE v2) — 공격 버튼 바로 아래 작은 글자 링크(11-24 2안).
 * 낙관적: 확인을 누르면 팝업을 닫고 곧바로 onOptimistic으로 카드를 '취소함' 상태로 바꾼다. 서버가 받으면 목록으로 가며
 * 헤더 알림, 거절·통신 실패면 onRollback으로 되돌리고 오류 토스트.
 */
export function RaidCancel({
  raidId,
  cancel,
  onOptimistic,
  onRollback,
}: {
  raidId: string;
  cancel: NonNullable<RaidView['cancel']>;
  onOptimistic: () => void;
  onRollback: () => void;
}) {
  const router = useRouter();
  const { showError, showHeaderToast } = useResourceToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const leave = cancel.kind === 'leave';
  const deadlineMs = leave ? Date.parse(cancel.deadlineIso) : 0;
  // 무료 소환(낸 💎 0) — 금액 조회가 실패했으면(null) 무료로 단정하지 않는다.
  const free = !leave && cancel.refund === 0;
  const freeAgain = !leave && cancel.freeAgain;
  // 횟수는 참여·소환한 날 몫으로 돌려받는다(자정을 넘겨 취소하면 어제 몫) — '오늘'이라 쓰지 않는다.

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    onOptimistic();
    const r = await (leave ? leaveRaidAction(raidId) : cancelHostedRaidAction(raidId)).catch(
      () => ({ status: 'error', message: '연결이 끊겨 취소하지 못했어요. 다시 시도해 주세요.' }) as const,
    );
    setBusy(false);
    if (r.status !== 'success') {
      onRollback();
      showError(r.message ?? '취소하지 못했어요.');
      return;
    }
    if (leave) {
      showHeaderToast({ title: '참여를 취소했어요', detail: '레이드 횟수 1회를 돌려받았어요.' });
    } else {
      const refund = 'refund' in r ? Number(r.refund) : 0;
      showHeaderToast({ title: '소환을 취소했어요', detail: refund > 0 ? josa(`💎${fmt(refund)}#{을} 돌려받았어요.`) : freeAgain ? '오늘 첫 무료 소환을 다시 쓸 수 있어요.' : '레이드 횟수 1회를 돌려받았어요.' });
    }
    router.replace('/raid');
  };

  // 글자 링크(2026-11-24 공격 버튼 2안) — 공격 줄 아래 보조 동작이라 버튼 무게를 빼고 작은 밑줄 글자로 둔다.
  // 누르는 자리는 py-2로 손가락 크기를 지킨다.
  const btnCls =
    'mx-auto flex w-fit items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-zinc-500 active:text-zinc-300 disabled:opacity-60';
  // 밑줄은 '취소' 글자에만 — 버튼(flex)에 주면 옆 보조 글자(남은 시간·무료 되돌리기)까지 전파된다(캡처 검수 11-24).
  const linkCls = 'underline decoration-zinc-700 underline-offset-4';

  return (
    <>
      {leave ? (
        <Ticker intervalMs={1000}>
          {(now) => {
            const t = leftText(deadlineMs, now);
            if (!t) return null; // 10분이 지나면 사라진다(서버도 다시 검사)
            return (
              <button type="button" disabled={busy} onClick={() => setOpen(true)} className={btnCls}>
                <span className={linkCls}>참여 취소</span><span className="font-mono text-[11px] font-semibold text-zinc-500">{t}</span>
              </button>
            );
          }}
        </Ticker>
      ) : (
        <button type="button" disabled={busy} onClick={() => setOpen(true)} className={btnCls}>
          <span className={linkCls}>소환 취소</span>
          {free && freeAgain ? <span className="text-[11px] font-semibold text-zinc-600">무료 소환 되돌리기</span> : null}
        </button>
      )}

      {open ? (
        <ModalShell onClose={() => setOpen(false)} label={leave ? '참여 취소' : '소환 취소'}>
          <ModalLayout
            title={leave ? '참여를 취소할까요?' : '소환을 취소할까요?'}
            footer={
              <>
                <ModalButton tone="neutral" onClick={() => setOpen(false)}>
                  닫기
                </ModalButton>
                <ModalButton tone="danger" onClick={run}>
                  {leave ? '참여 취소' : '소환 취소'}
                </ModalButton>
              </>
            }
          >
            <div className="space-y-2 text-[12.5px] leading-relaxed break-keep text-zinc-200">
              {leave ? (
                <p>이 레이드 참여자에서 빠지고, 레이드 횟수 1회를 돌려받아요.</p>
              ) : (
                <>
                  <p>
                    {cancel.refund == null
                      ? '레이드가 사라지고 낸 소환비를 돌려받아요.'
                      : free
                        ? freeAgain
                          ? '레이드가 사라지고 오늘 첫 무료 소환을 다시 쓸 수 있어요.'
                          : '레이드가 사라져요. 무료로 소환한 레이드라 돌려받을 다이아는 없어요.'
                        : josa(`레이드가 사라지고 소환비 💎${fmt(cancel.refund)}#{을} 돌려받아요.`)}
                  </p>
                  <p>레이드 횟수 1회도 함께 돌려받아요.</p>
                </>
              )}
            </div>
            <p className="mt-3 rounded-lg bg-zinc-800 px-3 py-2 text-[11px] leading-relaxed break-keep text-zinc-400">
              {leave ? '취소는 참여한 뒤 10분 안에, 공격하기 전까지만 할 수 있어요.' : '다른 참가자가 있거나 공격을 한 번이라도 하면 취소할 수 없어요.'}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </>
  );
}
