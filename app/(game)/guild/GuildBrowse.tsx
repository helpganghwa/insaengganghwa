'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';

import { searchGuildsAction, joinGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { GuildList, type GuildRow } from './GuildList';

export function GuildBrowse({
  ranking,
  myRequestGuildId,
}: {
  ranking: GuildRow[];
  myRequestGuildId: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [tab, setTab] = useState<'ranking' | 'search'>('ranking');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GuildRow[] | null>(null);
  const [pending, start] = useTransition();

  const search = () => {
    start(async () => {
      const r = await searchGuildsAction(q);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      setResults(r.results as GuildRow[]);
    });
  };

  const join = (id: string) => {
    start(async () => {
      const r = await joinGuildAction(id);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: r.joined ? '길드 가입 완료' : '가입 신청 완료' });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-4 pb-28">
      {/* 탭 */}
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(
          [
            ['ranking', '길드 랭킹'],
            ['search', '길드 찾기'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition ${
              tab === key
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                : 'text-zinc-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'ranking' ? (
          <GuildList
            guilds={ranking}
            showRank
            onJoin={join}
            pending={pending}
            myRequestGuildId={myRequestGuildId}
            emptyText="아직 결성된 길드가 없습니다. 첫 길드를 만들어보세요!"
          />
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="길드 이름 검색"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={search}
                disabled={pending}
                className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-white dark:bg-zinc-200 dark:text-zinc-900 disabled:opacity-50"
              >
                검색
              </button>
            </div>
            {results && (
              <div className="mt-3">
                <GuildList
                  guilds={results}
                  onJoin={join}
                  pending={pending}
                  myRequestGuildId={myRequestGuildId}
                  emptyText="검색 결과가 없습니다."
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 길드 생성 FAB — 컬럼 우하단(바텀네비 위) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[390px]">
        <div className="flex justify-end px-4 pb-[calc(env(safe-area-inset-bottom)+72px)]">
          <Link
            href="/guild/create"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-600 py-3 pl-4 pr-5 text-sm font-bold text-white shadow-lg shadow-amber-900/30 active:scale-95"
          >
            <span className="text-lg leading-none">+</span> 길드 생성
          </Link>
        </div>
      </div>
    </div>
  );
}
