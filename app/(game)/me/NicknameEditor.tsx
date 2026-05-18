'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateNickname } from './actions';

export function NicknameEditor({ current }: { current: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-2 text-lg font-semibold tracking-tight"
      >
        {current} <span className="text-xs text-zinc-400">✎</span>
      </button>
    );
  }
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateNickname(fd);
          if (r.status === 'error') setErr(r.message);
          else {
            setEditing(false);
            setErr(null);
            router.refresh();
          }
        })
      }
      className="mt-2 flex flex-col items-center gap-1"
    >
      <div className="flex gap-1">
        <input
          name="nickname"
          defaultValue={current}
          maxLength={16}
          className="w-40 rounded-full border border-zinc-300 px-3 py-1 text-center text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          저장
        </button>
      </div>
      {err ? <span className="text-[11px] text-red-500">{err}</span> : null}
    </form>
  );
}
