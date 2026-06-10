'use client';

import { useState, type ReactNode } from 'react';

import { GuildList, type GuildRow } from './GuildList';

/** 가입 회원 첫화면 — [길드 홈 | 길드 랭킹] 상단 탭. */
export function GuildMemberTabs({ home, ranking }: { home: ReactNode; ranking: GuildRow[] }) {
  const [tab, setTab] = useState<'home' | 'ranking'>('home');

  return (
    <div className="px-3 py-3">
      <div className="mb-2.5 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(
          [
            ['home', '길드 홈'],
            ['ranking', '길드 랭킹'],
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

      {/* 비활성 탭은 hidden으로 유지(홈 상태·스크롤 보존) */}
      <div className={tab === 'home' ? '' : 'hidden'}>{home}</div>
      <div className={tab === 'ranking' ? '' : 'hidden'}>
        <GuildList guilds={ranking} showRank emptyText="아직 결성된 길드가 없습니다." />
      </div>
    </div>
  );
}
