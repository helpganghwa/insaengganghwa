'use client';

import { useState, useTransition } from 'react';

import { startOnServerAction } from './actions';

/**
 * 새 서버에서 시작할지 묻는 두 버튼(2026-09-21 ②).
 * 되돌릴 수 없는 쪽(새로 시작)은 한 번 더 누르게 한다 — 캐릭터는 지울 수 없다.
 */
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
  const [armed, setArmed] = useState(false);
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
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          start(() => {
            void startOnServerAction(serverId);
          });
        }}
        className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
      >
        {pending
          ? '만드는 중...'
          : armed
            ? `정말 ${serverName}에서 새로 시작할까요? 한 번 더 누르면 시작돼요`
            : `${serverName}에서 새로 시작하기`}
      </button>
      {armed && !pending && (
        <p className="text-center text-[11px] leading-relaxed text-zinc-400">
          새로 만든 캐릭터는 지울 수 없어요.
        </p>
      )}
    </div>
  );
}
