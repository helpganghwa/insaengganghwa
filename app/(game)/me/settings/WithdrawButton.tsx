'use client';

import { useState, useTransition } from 'react';

import { withdrawAction } from './withdraw-actions';

const ERR: Record<string, string> = {
  LEADER_MUST_TRANSFER: '길드장은 위임하거나 길드를 해산한 뒤 탈퇴할 수 있어요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  UNKNOWN: '탈퇴 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
};

export function WithdrawButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const confirm = () => {
    setErr(null);
    start(async () => {
      // 성공 시 서버가 /login으로 redirect(이 함수는 반환 안 함). 실패만 코드 반환.
      const r = await withdrawAction();
      if (r?.status === 'error') setErr(ERR[r.code] ?? ERR.UNKNOWN!);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs text-zinc-400 underline underline-offset-2"
      >
        회원탈퇴
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-2xl bg-white p-5 text-center dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-3xl">⚠️</div>
            <h2 className="mt-2 text-base font-bold">정말 탈퇴하시겠어요?</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              캐릭터·아이템·강화·보급 등 모든 게임 데이터가 즉시 삭제되며 복구할 수 없어요.
              결제 내역은 법령에 따라 보존됩니다. 같은 카카오로 다시 로그인하면 새로 시작합니다.
            </p>
            {err && (
              <p className="mt-3 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                {err}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium dark:border-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? '처리 중…' : '탈퇴'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
