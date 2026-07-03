'use client';

import { useState, useTransition } from 'react';

import { banUserAction, unbanUserAction, warnUserAction } from './actions';

/** 유저 상세 제재 패널 — 정지(사유+기간)/해제/경고 우편. 신고 없이도 사용 가능. */
export function UserModActions({ userId, banned }: { userId: string; banned: boolean }) {
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ status: string; code?: string }>) =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.status === 'success' ? '처리 완료' : `실패: ${r.code ?? 'UNKNOWN'}`);
    });

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold">제재</p>
      {banned ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => unbanUserAction(userId))}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          정지 해제
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유(유저에게 노출)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            종료(KST, 비우면 영구)
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => banUserAction(userId, reason, until || null))}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              계정 정지
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => warnUserAction(userId))}
              className="rounded-lg border border-amber-500 px-4 py-2 text-sm font-medium text-amber-600 disabled:opacity-50"
            >
              경고 우편
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
