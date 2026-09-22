'use client';

import { useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import type { SongpyeonOverview } from '@/lib/game/chuseok/songpyeon';

import { SongpyeonPanel } from './SongpyeonPanel';

export type ChuseokTab = 'rank' | 'songpyeon';

const TABS = [
  { key: 'rank', label: '순위' },
  { key: 'songpyeon', label: '송편' },
] as const;

/**
 * 한가위 강화 대회 페이지 — 세그먼트 두 개(순위 | 송편). 전환은 상태만 바꾼다(무왕복).
 * 순위 세그먼트는 다음 단계(대회 집계)에서 채운다.
 */
export function ChuseokEventClient({ initialTab, songpyeon }: { initialTab: ChuseokTab; songpyeon: SongpyeonOverview }) {
  const [tab, setTab] = useState<ChuseokTab>(initialTab);
  return (
    <div className="px-4 pb-24 pt-3">
      <PageHeader title="한가위 강화 대회" fallback="/" kicker={<span className="text-[11px] text-amber-300">9/30 23:59 마감</span>} />
      <div className="mt-3">
        <Tabs items={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'rank' ? (
        <p className="px-2 py-14 text-center text-[13px] text-zinc-500">순위표는 준비 중이에요.</p>
      ) : (
        <SongpyeonPanel initial={songpyeon} />
      )}
    </div>
  );
}
