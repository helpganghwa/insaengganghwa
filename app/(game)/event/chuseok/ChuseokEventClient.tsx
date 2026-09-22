'use client';

import { useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import type { ContestBoard } from '@/lib/game/chuseok/contest';
import type { SongpyeonOverview } from '@/lib/game/chuseok/songpyeon';

import { RankPanel } from './RankPanel';
import { SongpyeonPanel } from './SongpyeonPanel';

export type ChuseokTab = 'rank' | 'songpyeon';

const TABS = [
  { key: 'rank', label: '순위' },
  { key: 'songpyeon', label: '송편' },
] as const;

/** 한가위 강화 대회 페이지 — 세그먼트 두 개(순위 | 송편). 전환은 상태만 바꾼다(무왕복). */
export function ChuseokEventClient({ initialTab, songpyeon, board }: { initialTab: ChuseokTab; songpyeon: SongpyeonOverview; board: ContestBoard }) {
  const [tab, setTab] = useState<ChuseokTab>(initialTab);
  const ended = board.phase !== 'accrue' && board.phase !== 'before';
  return (
    <div className="px-4 pb-24 pt-3">
      <PageHeader
        title="한가위 강화 대회"
        fallback="/"
        kicker={<span className="text-[11px] text-amber-300">{ended ? '9/30 23:59 확정' : '9/30 23:59 마감'}</span>}
      />
      <div className="mt-3">
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'rank' ? <RankPanel board={board} /> : <SongpyeonPanel initial={songpyeon} />}
    </div>
  );
}
