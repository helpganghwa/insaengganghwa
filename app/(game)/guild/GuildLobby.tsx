'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { GUILD_CREATE_COST_DIAMOND, GUILD_NAME_MAX_LEN } from '@/lib/game/guild/balance';

import { createGuildAction, searchGuildsAction, joinGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';

type GuildRow = { id: string; name: string; level: number; memberCount: number };

export function GuildLobby() {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GuildRow[] | null>(null);
  const [pending, start] = useTransition();

  const create = () => {
    const nm = name.trim();
    if (!nm) return;
    start(async () => {
      const r = await createGuildAction(nm);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      optimisticAdjust(BigInt(-GUILD_CREATE_COST_DIAMOND));
      showHeaderToast({ title: '길드 결성 완료' });
      router.refresh();
    });
  };

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
      showHeaderToast({ title: '길드 가입 완료' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 결성 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-bold">길드 결성</h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          비용 {GUILD_CREATE_COST_DIAMOND.toLocaleString('ko-KR')}💎 · 이름은 변경 불가
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={GUILD_NAME_MAX_LEN}
            placeholder="길드 이름 (2~10자)"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            결성
          </button>
        </div>
      </section>

      {/* 검색·가입 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-bold">길드 찾기</h2>
        <div className="mt-2 flex gap-2">
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
          <ul className="mt-3 space-y-2">
            {results.length === 0 && <li className="text-xs text-zinc-500">검색 결과가 없습니다.</li>}
            {results.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{g.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    Lv.{g.level} · {g.memberCount}명
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => join(g.id)}
                  disabled={pending}
                  className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                >
                  가입
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
