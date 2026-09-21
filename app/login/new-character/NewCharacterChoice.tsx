'use client';

import { useTransition } from 'react';

import { startOnServerAction } from './actions';

export type MyServer = {
  id: number;
  name: string;
  nickname: string;
  /** 그 서버 지갑(문자열 — bigint 직렬화). */
  diamond: string;
};

const fmt = (v: string) => {
  try {
    return BigInt(v).toLocaleString('ko-KR');
  } catch {
    return v;
  }
};

/**
 * 새 서버에서 시작할지 고르는 화면의 버튼들(2026-09-21 ②).
 * 돌아갈 서버가 하나면 버튼 하나, 여럿이면 목록 — 맨 위가 마지막으로 하던 곳이다.
 */
export function NewCharacterChoice({
  serverId,
  serverName,
  mine,
}: {
  serverId: number;
  serverName: string;
  mine: MyServer[];
}) {
  const [pending, start] = useTransition();
  const many = mine.length > 1;

  return (
    <div className="flex w-full flex-col gap-2">
      {/* 새로 시작 — 이 화면에서 고르라고 내민 동작이라 주 버튼. */}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(() => {
            void startOnServerAction(serverId);
          })
        }
        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-zinc-900 disabled:opacity-60"
      >
        {pending ? '만드는 중...' : `${serverName}에서 새로 시작하기`}
      </button>

      {/* 하던 서버로 돌아가기 — 있는 그대로만 보여 준다. */}
      <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {mine.map((s) => (
          <a
            key={s.id}
            href={`/auth/switch-server?to=${s.id}`}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
          >
            {many ? (
              <>
                <span className="min-w-0 truncate text-sm font-semibold">
                  {s.name}
                  <span className="ml-1.5 font-medium text-zinc-400">{s.nickname}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-zinc-400">
                  💎 {fmt(s.diamond)}
                </span>
              </>
            ) : (
              <span className="w-full text-center text-sm font-semibold">{s.name}로 돌아가기</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
