'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { josa } from 'josa';

import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalConfirmButton, ModalLayout } from '@/components/ModalLayout';
import { PlusChip } from '@/components/ui/PlusChip';
import { resyncWhenOnline } from '@/lib/client/resync';
import { useResourceToast } from '@/components/ResourceToast';
import { PROFILE_MAX, PROFILE_SLOT_COST_DIAMOND, PROFILE_SLOT_STEP } from '@/lib/game/balance';

import { expandAvatarSlotsAction } from './actions';

const fmt = (n: number) => n.toLocaleString('ko-KR');

/**
 * 아바타 관리 제목 오른쪽 "N / 한도 ＋"(2026-10-06 확정 시안 B — ＋는 늘 보임, 최대 200칸이면 숨김).
 * ＋ → 공용 팝업(ModalShell+ModalLayout) → 헤더 토스트. 다이아가 모자라면 공용 '다이아 부족' 팝업(막지 않음).
 * 다이아는 낙관적으로 먼저 깎고(실패 시 되돌림), 한도는 서버 액션의 재렌더로 바뀐다(그 전까지 낙관 표시).
 */
export function AvatarSlotKicker({ count, limit }: { count: number; limit: number }) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust, setBase } = useDiamondActions();
  const gate = useDiamondGate();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  // 결과를 모르는 채 끝난 구매의 요청 키(응답 유실·서버 오류) — 서버에서는 이미 늘렸을 수 있어, 한도가 그대로인 동안은
  // 같은 키로 다시 보낸다(서버가 같은 구매로 알아보고 💎를 두 번 받지 않는다). 한도가 바뀌었으면 그 구매는 들어간 것.
  const unsettled = useRef<{ key: string; limit: number } | null>(null);
  // 산 직후 서버 재렌더가 오기 전까지 보여 줄 한도 — 새 limit이 오면 그 값을 쓴다.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const [seen, setSeen] = useState(limit);
  if (seen !== limit) {
    setSeen(limit);
    setOptimistic(null);
  }
  const shown = Math.max(limit, optimistic ?? 0);
  const canExpand = shown < PROFILE_MAX;
  const next = Math.min(PROFILE_MAX, shown + PROFILE_SLOT_STEP);

  const expand = () => {
    if (pending || busy.current) return;
    if (!gate.ensure(PROFILE_SLOT_COST_DIAMOND)) {
      setOpen(false);
      return;
    }
    busy.current = true;
    setOpen(false);
    const prev = unsettled.current;
    const key = prev && prev.limit === limit ? prev.key : crypto.randomUUID().replace(/-/g, '');
    const before = optimistic;
    optimisticAdjust(-BigInt(PROFILE_SLOT_COST_DIAMOND));
    setOptimistic(next);
    start(async () => {
      const r = await expandAvatarSlotsAction(key).catch(() => ({ status: 'error', code: 'NETWORK' }) as const);
      busy.current = false;
      if (r.status === 'ok') {
        unsettled.current = null;
        // 헤더 💎를 서버 잔액으로 맞춘다 — 같은 키의 재전송(앞선 요청이 이미 들어가 있었다)이어도 두 번 깎여 보이지 않게.
        setBase(BigInt(r.diamondBalance));
        showHeaderToast({ title: '아바타 보관함', detail: `${fmt(r.limit)}칸으로 늘었어요` });
        return;
      }
      const unknown = r.code === 'NETWORK' || r.code === 'UNKNOWN';
      unsettled.current = unknown ? { key, limit } : null;
      optimisticAdjust(BigInt(PROFILE_SLOT_COST_DIAMOND));
      setOptimistic(before); // 직전 표시값으로(앞선 구매의 낙관값을 지우지 않게)
      // 결과를 모르면 화면을 서버 값으로 다시 맞춘다 — 서버에서는 늘렸을 수 있다.
      if (unknown) resyncWhenOnline(() => router.refresh());
      if (r.code === 'INSUFFICIENT_DIAMOND') gate.open(PROFILE_SLOT_COST_DIAMOND);
      else if (r.code === 'SLOT_MAX') showError(`보관함은 최대 ${PROFILE_MAX}칸까지 늘릴 수 있어요`);
      else if (r.code === 'RATE_LIMITED') showError('요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.');
      else if (r.code === 'NETWORK') showError('요청이 전송되지 않았어요. 연결을 확인해 주세요.');
      else showError('보관함을 늘리지 못했어요');
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
      <span className={`text-[11px] font-semibold tabular-nums ${count >= shown ? 'text-red-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {fmt(count)} / {fmt(shown)}
      </span>
      {canExpand ? (
        <PlusChip label="아바타 보관함 늘리기" onClick={() => setOpen(true)} />
      ) : null}
      {open ? (
        <ModalShell onClose={() => setOpen(false)} label="아바타 보관함 늘리기">
          <ModalLayout
            title="아바타 보관함 늘리기"
            subtitle={`아바타를 ${PROFILE_SLOT_STEP}개 더 보관할 수 있어요.`}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setOpen(false)}>
                  닫기
                </ModalButton>
                {/* 3초 재확인(10-06) — 다이아가 모자라면 무장하지 않고 공용 부족 팝업. */}
                <ModalConfirmButton
                  onArm={() => {
                    if (pending) return false;
                    if (!gate.ensure(PROFILE_SLOT_COST_DIAMOND)) {
                      setOpen(false);
                      return false;
                    }
                  }}
                  onConfirm={expand}
                  disabled={pending}
                >
                  {josa(`💎${fmt(PROFILE_SLOT_COST_DIAMOND)}#{으로} 늘리기`)}
                </ModalConfirmButton>
              </>
            }
          >
            <div className="flex items-end justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
              <div>
                <p className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400">가격</p>
                <p className="text-[22px] font-extrabold tabular-nums text-amber-600 dark:text-amber-300">💎{fmt(PROFILE_SLOT_COST_DIAMOND)}</p>
              </div>
              <p className="text-right text-[11.5px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                보관함
                <br />
                <b className="text-[13px] tabular-nums text-zinc-800 dark:text-zinc-100">
                  {fmt(shown)} → {fmt(next)}칸
                </b>
              </p>
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}
      {gate.modal}
    </span>
  );
}
