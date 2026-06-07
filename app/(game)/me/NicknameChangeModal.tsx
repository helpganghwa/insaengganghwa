'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';
import { NICKNAME_MAX_LEN, NICKNAME_MIN_LEN, nicknameLen, validateNickname } from '@/lib/game/nickname';
import { useResourceToast } from '@/components/ResourceToast';

import { changeNicknameAction } from './actions';

/**
 * 닉네임 변경 팝업. 첫 변경 무료 / 이후 NICKNAME_CHANGE_COST_DIAMOND(=300) 차감.
 * 진입: 프로필 페이지의 닉네임(클릭) · 설정 페이지의 닉네임 row(클릭).
 */
export function NicknameChangeModal({
  open,
  onClose,
  currentNickname,
  changedCount,
  diamond,
}: {
  open: boolean;
  onClose: () => void;
  currentNickname: string;
  /** 이전 변경 횟수. 0이면 첫 변경 무료. */
  changedCount: number;
  /** 보유 다이아(bigint string). 비용 안내·검증용. */
  diamond: string;
}) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const [next, setNext] = useState(currentNickname);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setNext(currentNickname);
      setErr(null);
    }
  }, [open, currentNickname]);

  if (!open) return null;
  const isFree = changedCount === 0;
  const cost = isFree ? 0 : NICKNAME_CHANGE_COST_DIAMOND;
  const canAfford = BigInt(diamond || '0') >= BigInt(cost);
  const unchanged = next.trim() === currentNickname.trim();
  const validation = validateNickname(next);
  const canSubmit = !pending && !unchanged && validation.ok && canAfford;
  const usedLen = nicknameLen(next.trim());

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await changeNicknameAction(next);
      if (r.status === 'error') {
        setErr(r.message);
        return;
      }
      onClose();
      showHeaderToast({ title: '닉네임 변경', detail: next.trim() });
      router.refresh();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="닉네임 변경"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold">닉네임 변경</h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          {isFree ? (
            <>최초 변경은 <span className="font-semibold text-emerald-600">무료</span>입니다.</>
          ) : (
            <>
              💎 <span className="font-semibold tabular-nums">{NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')}</span> 차감 · 보유{' '}
              <span className="tabular-nums">{Number(diamond).toLocaleString('ko-KR')}</span>
            </>
          )}
        </p>

        {/* IME composition 중 자모 분리(ㄱ·ㅏ)를 onChange에서 strip하지 않음 — 한글 입력 보존. */}
        {/* 검증은 변경확인(submit) 시 validateNickname()이 수행. */}
        <input
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setErr(null);
          }}
          // 자모 합성 여유로 약간 크게(10*2=20), 실제 한도는 validateNickname.
          maxLength={NICKNAME_MAX_LEN * 2}
          placeholder={`${NICKNAME_MIN_LEN}~${NICKNAME_MAX_LEN}자 (한글·영문·숫자)`}
          className="mt-3 w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-2 text-base dark:border-zinc-700"
          autoFocus
        />
        <p className="mt-1 text-right text-[10px] text-zinc-500 tabular-nums">
          {usedLen} / {NICKNAME_MAX_LEN}자
        </p>

        {err ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {err}
          </p>
        ) : !canAfford && !isFree ? (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            다이아가 부족합니다 (필요 {NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')})
          </p>
        ) : null}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
          >
            {pending ? '변경 중…' : isFree ? '변경(무료)' : `💎 ${NICKNAME_CHANGE_COST_DIAMOND.toLocaleString('ko-KR')} 변경`}
          </button>
        </div>
      </div>
    </div>
  );
}
