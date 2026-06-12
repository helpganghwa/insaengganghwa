'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import type { ServerListItem } from '@/lib/game/server-select';

import { enterServerAction, createCharacterAction, suggestNicknameAction } from './actions';

const ERR_MSG: Record<string, string> = {
  SERVER_NOT_OPEN: '입장할 수 없는 서버입니다.',
  ALREADY_EXISTS: '이미 캐릭터가 있는 서버입니다.',
  NICKNAME_INVALID: '닉네임은 한글/영문/숫자 2~8자입니다.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다. (전 서버 공통)',
  NO_CHARACTER: '캐릭터가 없는 서버입니다. 먼저 생성하세요.',
  UNKNOWN: '오류가 발생했습니다.',
};

/** 서버 선택 — 캐릭터 보유 서버 입장 / 미보유 서버 캐릭터 생성(새 닉네임, 전 서버 유일). */
export function ServerList({ servers, activeId }: { servers: ServerListItem[]; activeId: number }) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState<number | null>(null); // 생성 폼 열린 서버
  const [nickname, setNickname] = useState('');

  // 생성 폼 오픈 시 닉네임 자동 제안.
  useEffect(() => {
    if (creating == null) return;
    suggestNicknameAction().then((r) => {
      if (r.status === 'success') setNickname(r.nickname);
    });
  }, [creating]);

  const enter = (id: number) =>
    start(async () => {
      const r = await enterServerAction(id);
      if (r.status !== 'success') return showError(ERR_MSG[r.code] ?? ERR_MSG.UNKNOWN!);
      showHeaderToast({ title: `${servers.find((s) => s.id === id)?.name ?? '서버'} 입장` });
      router.push('/');
      router.refresh();
    });

  const create = (id: number) =>
    start(async () => {
      const r = await createCharacterAction(id, nickname);
      if (r.status !== 'success') return showError(ERR_MSG[r.code] ?? ERR_MSG.UNKNOWN!);
      showHeaderToast({ title: '캐릭터 생성 완료' });
      router.push('/');
      router.refresh();
    });

  return (
    <div className="px-4 py-4">
      <h1 className="text-base font-bold">서버 선택</h1>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        서버마다 캐릭터·진행·다이아가 분리됩니다. 닉네임은 전 서버에서 하나만 사용할 수 있어요.
      </p>
      <ul className="mt-4 space-y-2">
        {servers.map((s) => (
          <li key={s.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold">{s.name}</span>
                  {s.id === activeId && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                      접속 중
                    </span>
                  )}
                  {s.status !== 'open' && (
                    <span className="rounded-full bg-zinc-500/15 px-1.5 text-[9px] font-bold text-zinc-500">
                      {s.status === 'full' ? '생성 제한' : '준비 중'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {s.my ? `${s.my.nickname} · 💎${Number(s.my.diamond).toLocaleString('ko-KR')}` : '캐릭터 없음'}
                </p>
              </div>
              {s.my ? (
                <button
                  type="button"
                  disabled={pending || s.id === activeId}
                  onClick={() => enter(s.id)}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
                >
                  입장
                </button>
              ) : s.status === 'open' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setCreating(creating === s.id ? null : s.id)}
                  className="shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 text-[12px] font-bold text-amber-600 disabled:opacity-40 dark:border-amber-800 dark:text-amber-400"
                >
                  캐릭터 생성
                </button>
              ) : null}
            </div>

            {creating === s.id && (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
                <label className="text-[11px] font-semibold text-zinc-500">새 닉네임 (한글/영문/숫자 2~8자)</label>
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={8}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      suggestNicknameAction().then((r) => {
                        if (r.status === 'success') setNickname(r.nickname);
                      })
                    }
                    className="shrink-0 rounded-lg border border-zinc-300 px-2.5 text-[11px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    🎲
                  </button>
                  <button
                    type="button"
                    disabled={pending || nickname.trim().length < 2}
                    onClick={() => create(s.id)}
                    className="shrink-0 rounded-lg bg-amber-600 px-3 text-[12px] font-bold text-white disabled:opacity-40"
                  >
                    생성
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
