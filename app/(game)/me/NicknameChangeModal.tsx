'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';
import {
  NICKNAME_MAX_BYTES,
  nicknameByteLen,
  validateNickname,
} from '@/lib/game/nickname';

import { changeNicknameAction } from './actions';

/**
 * 닉네임 변경 팝업. 첫 변경 무료 / 이후 1000다이아.
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
  const usedBytes = nicknameByteLen(next.trim());

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await changeNicknameAction(next);
      if (r.status === 'error') {
        setErr(r.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="닉네임 변경"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-4 dark:bg-zinc-950"
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

        <input
          value={next}
          onChange={(e) => {
            // byte 한도 초과 입력 차단(붙여넣기 포함). 한 글자 더 들어오는 순간 잘라냄.
            let v = e.target.value;
            while (nicknameByteLen(v.trim()) > NICKNAME_MAX_BYTES) v = v.slice(0, -1);
            setNext(v);
            setErr(null);
          }}
          // 안전망 — 영문 12자 입력 시 deterministic 컷.
          maxLength={NICKNAME_MAX_BYTES}
          placeholder="한글 6자 / 영문 12자"
          className="mt-3 w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-2 text-sm dark:border-zinc-700"
          autoFocus
        />
        <p className="mt-1 text-right text-[10px] text-zinc-500 tabular-nums">
          {usedBytes} / {NICKNAME_MAX_BYTES} byte
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
