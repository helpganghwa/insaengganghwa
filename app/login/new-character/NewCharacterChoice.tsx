'use client';

import { useTransition } from 'react';

import { startOnServerAction } from './actions';

/** 새 서버에서 시작할지 고르는 두 버튼(2026-09-21 ②). 돌아가기가 주 버튼. */
export function NewCharacterChoice({
  serverId,
  serverName,
  backHref,
  backLabel,
}: {
  serverId: number;
  serverName: string;
  backHref: string;
  backLabel: string;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex w-full flex-col gap-2">
      <a
        href={backHref}
        className="w-full rounded-xl bg-amber-500 py-3 text-center text-sm font-bold text-zinc-900"
      >
        {backLabel}
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(() => {
            void startOnServerAction(serverId);
          })
        }
        className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
      >
        {pending ? '만드는 중...' : `${serverName}에서 새로 시작하기`}
      </button>
    </div>
  );
}
