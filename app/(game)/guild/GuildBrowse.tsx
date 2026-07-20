'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';

import { searchGuildsAction, joinGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { GuildList, type GuildRow } from './GuildList';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';

/** 랭킹 정렬 지표 — /guild/ranking 페이지와 동일 3종. 클라 전환(각 지표별 서버측 top-N). */
type RankSort = 'level' | 'combat' | 'zones';
const RANK_SORTS: { key: RankSort; label: string }[] = [
  { key: 'level', label: '레벨' },
  { key: 'combat', label: '전투력' },
  { key: 'zones', label: '점령지' },
];

export function GuildBrowse({
  rankings,
  defaultGuilds,
  myRequestGuildId,
}: {
  /** 지표별 랭킹 3종(레벨/전투력/점령지) — 각 지표 기준 진짜 top-N. */
  rankings: Record<RankSort, GuildRow[]>;
  /** 검색 전 기본 노출(랜덤 추천). */
  defaultGuilds: GuildRow[];
  myRequestGuildId: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [tab, setTab] = useState<'ranking' | 'search'>('ranking');
  const [rankSort, setRankSort] = useState<RankSort>('level');
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
          <>
            {/* 정렬 필터 — /guild/ranking과 동일 3종. 클릭 시 클라에서 즉시 전환. */}
            <div className="mb-3 flex justify-end">
              <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
                {RANK_SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setRankSort(s.key)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                      rankSort === s.key
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-500'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <GuildList
              guilds={rankings[rankSort]}
              showRank
              onJoin={join}
              pending={pending}
              myRequestGuildId={myRequestGuildId}
              emptyText="아직 결성된 길드가 없습니다. 첫 길드를 만들어보세요!"
            />
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <ZoomSafeInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="길드 이름 검색"
                wrapClassName="h-9 min-w-0 flex-1"
                className="rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
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
            {/* 검색 전(results===null)엔 랜덤 추천 길드, 검색 후엔 결과. */}
            <div className="mt-3">
              <GuildList
                guilds={results ?? defaultGuilds}
                onJoin={join}
                pending={pending}
                myRequestGuildId={myRequestGuildId}
                emptyText={results === null ? '아직 결성된 길드가 없습니다.' : '검색 결과가 없습니다.'}
              />
            </div>
          </>
        )}
      </div>

      {/* 길드 생성 FAB — 컬럼 우하단(바텀네비 위). 가이드 티커가 켜져 있으면 그 높이(--gt-h,
          GuideTicker가 발행)만큼 더 올라가 겹치지 않는다(꺼지면 0px — 기존 72px 위치). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[390px]">
        {/* 채팅 미니바(--chat-dock-h) 위로도 회피 — 미니바와 FAB가 겹치던 문제(2026-07-20). */}
        <div className="flex justify-end px-4 pb-[calc(env(safe-area-inset-bottom)+72px+var(--gt-h,0px)+var(--chat-dock-h,0px))]">
          <Link prefetch={false}
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
