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
      {mine.map((s, i) => (
        <a
          key={s.id}
          href={`/auth/switch-server?to=${s.id}`}
          className={
            i === 0
              ? 'flex w-full items-center justify-between gap-3 rounded-xl bg-amber-500 px-4 py-3 text-zinc-900'
              : 'flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
          }
        >
          {many ? (
            <>
              <span className="min-w-0 truncate text-sm font-bold">
                {s.name}
                <span className={i === 0 ? 'ml-1.5 font-semibold text-zinc-900/70' : 'ml-1.5 font-semibold text-zinc-400'}>
                  {s.nickname}
                </span>
              </span>
              <span className={i === 0 ? 'shrink-0 text-[13px] font-bold' : 'shrink-0 text-[13px] font-bold text-zinc-400'}>
                💎 {fmt(s.diamond)}
              </span>
            </>
          ) : (
            <span className="w-full text-center text-sm font-bold">{s.name}로 돌아가기</span>
          )}
        </a>
      ))}

      {/* 돌아가기(위)와 성격이 다른 동작 — 선을 하나 두고 글자 버튼으로 낮춘다. */}
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(() => {
              void startOnServerAction(serverId);
            })
          }
          className="w-full py-2 text-[13px] font-semibold text-zinc-400 underline underline-offset-4 disabled:opacity-60 dark:text-zinc-500"
        >
          {pending ? '만드는 중...' : `${serverName}에서 새로 시작하기`}
        </button>
      </div>
    </div>
  );
}
