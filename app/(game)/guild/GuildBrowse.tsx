'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { GUILD_CREATE_COST_DIAMOND } from '@/lib/game/guild/balance';

import { searchGuildsAction, joinGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { GuildList } from './GuildList';
import { GuildRankingBoard, type RankSort } from './GuildRankingBoard';
import type { GuildRow } from './guild-row';

type Tab = 'recommend' | 'ranking' | 'search';
const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '추천' },
  { key: 'ranking', label: '랭킹' },
  { key: 'search', label: '검색' },
];

/**
 * 미가입 첫화면(B-1 확정안, 2026-07-30) — 가입을 **누르기 전에** 판단이 서게 한다.
 *
 * 목록 행이 정원(N/cap)과 길드장 활동을 보여주고, 정원이 찬 길드는 버튼을 잠근다
 * (종전엔 신청 후 GUILD_FULL로 거절됐다). 길드 만들기는 목록 끝의 행으로 내려
 * **비용을 함께** 보여준다 — 종전 FAB는 비용을 알 수 없었다.
 */
export function GuildBrowse({
  rankings,
  totalGuilds,
  defaultGuilds,
  myRequestGuildId,
}: {
  /** 지표별 랭킹 3종 — 서버가 전 길드 기준으로 확정한 순위. */
  rankings: Record<RankSort, GuildRow[]>;
  totalGuilds: number;
  /** 검색 전 기본 노출(랜덤 추천). */
  defaultGuilds: GuildRow[];
  myRequestGuildId: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [tab, setTab] = useState<Tab>('recommend');
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
    <div className="px-4 pb-4 pt-3 pb-28">
      {/* GNB 루트라 뒤로가기가 없다 — 다른 길드 화면(GuildPageHeader)과 같은 자리·크기만 맞춘다. */}
      <div className="px-0.5">
        <p className="text-[10px] font-semibold tracking-wide text-zinc-400">
          아직 소속 길드가 없습니다 · 전체 {totalGuilds}개
        </p>
        <h1 className="text-base font-extrabold leading-tight">길드 찾기</h1>
      </div>

      <div className="mt-3 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition ${
              tab === t.key
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                : 'text-zinc-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'recommend' ? (
          <GuildList
            guilds={defaultGuilds}
            onJoin={join}
            pending={pending}
            myRequestGuildId={myRequestGuildId}
            emptyText="아직 결성된 길드가 없습니다. 첫 길드를 만들어보세요!"
          />
        ) : tab === 'ranking' ? (
          <GuildRankingBoard
            lists={rankings}
            onJoin={join}
            pending={pending}
            myRequestGuildId={myRequestGuildId}
            emptyText="아직 결성된 길드가 없습니다. 첫 길드를 만들어보세요!"
          />
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
                className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
              >
                검색
              </button>
            </div>
            <div className="mt-3">
              <GuildList
                guilds={results ?? []}
                onJoin={join}
                pending={pending}
                myRequestGuildId={myRequestGuildId}
                emptyText={results === null ? '길드 이름을 검색해 보세요.' : '검색 결과가 없습니다.'}
              />
            </div>
          </>
        )}
      </div>

      {/* 길드 만들기 FAB — 목록 끝에 두니 찾기 어려웠다(2026-07-30). 비용은 라벨에 붙여
          누르기 전에 판단이 서게 한다.
          z-10 — 채팅 패널(z-20 fixed, DOM 후순위)이 열리면 FAB를 덮도록. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[390px]">
        {/* 채팅 미니바(--chat-dock-h) 위로 회피 — 미니바와 FAB가 겹치던 문제(2026-07-20). */}
        <div className="flex justify-end px-4 pb-[calc(env(safe-area-inset-bottom)+72px+var(--chat-dock-h,0px))]">
          <Link
            prefetch={false}
            href="/guild/create"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-600 py-3 pl-4 pr-5 text-sm font-bold text-white shadow-lg shadow-amber-900/30 active:scale-95"
          >
            <span className="text-lg leading-none">+</span> 길드 생성
            <span className="text-[11px] font-semibold text-amber-100">
              {GUILD_CREATE_COST_DIAMOND.toLocaleString('ko-KR')}💎
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
