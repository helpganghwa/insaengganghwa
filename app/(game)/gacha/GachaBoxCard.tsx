'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';

import { openAction, type OpenActionResult } from './actions';
import { GachaResultModal } from './GachaResultModal';

export function GachaBoxCard({
  slot,
  label,
  emoji,
  count,
}: {
  slot: Slot;
  label: string;
  emoji: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Extract<OpenActionResult, { status: 'success' }> | null>(
    null,
  );

  const pull = (n: 1 | 10) => {
    startTransition(async () => {
      const r = await openAction(slot, n);
      if (r.status === 'error') {
        alert(r.message);
        return;
      }
      setResult(r);
      router.refresh();
    });
  };

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            <span aria-hidden className="mr-1">
              {emoji}
            </span>
            {label}
          </h2>
          <span className="text-xs text-zinc-500">
            보유 <span className="font-mono font-semibold tabular-nums">{count}</span>개
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={pending || count < 1}
            onClick={() => pull(1)}
            className="flex-1 rounded-full bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
          >
            {pending ? '여는 중…' : '1회 개봉'}
          </button>
          <button
            type="button"
            disabled={pending || count < 10}
            onClick={() => pull(10)}
            className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? '…' : '10회 개봉'}
          </button>
        </div>
      </div>

      {result ? (
        <GachaResultModal
          emoji={emoji}
          results={result.results}
          remaining={result.remaining}
          gemTotal={result.gemTotal}
          pulling={pending}
          onAgain={pull}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}
