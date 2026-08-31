'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { decideAvatarReturn } from './actions';

/** 반환 1건 판정 버튼 — 전액/절반. 확정 후 목록에서 사라진다(pending만 노출). */
export function AdminReturnActions({ requestId, paid }: { requestId: string; paid: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const decide = (outcome: 'full' | 'half') => {
    if (pending) return;
    startTransition(async () => {
      const r = await decideAvatarReturn(requestId, outcome, note || undefined);
      if (r.status === 'error') {
        setErr(r.code);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모(선택)"
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => decide('full')}
          disabled={pending}
          className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          전액 💎{paid.toLocaleString('ko-KR')}
        </button>
        <button
          type="button"
          onClick={() => decide('half')}
          disabled={pending}
          className="rounded bg-amber-700 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          절반 💎{Math.floor(paid / 2).toLocaleString('ko-KR')}
        </button>
      </div>
      {err ? <div className="text-[11px] text-red-400">{err}</div> : null}
    </div>
  );
}
