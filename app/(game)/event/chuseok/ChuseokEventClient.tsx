'use client';

import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { CHUSEOK_ACCRUE_END_MS } from '@/lib/game/chuseok/config';
import { fmtLeft } from '@/lib/game/chuseok/countdown';
import type { ContestBoard } from '@/lib/game/chuseok/contest';
import type { SongpyeonOverview } from '@/lib/game/chuseok/songpyeon';

import { RankPanel } from './RankPanel';
import { SongpyeonPanel } from './SongpyeonPanel';

export type ChuseokTab = 'rank' | 'songpyeon';


/**
 * 추석 강화 이벤트 페이지 — 헤더 오른쪽에 초 단위 남은 시간(홈 배너와 같은 형식), 세그먼트 두 개(순위 | 송편).
 * 전환은 상태만 바꾼다(무왕복). 마감 뒤에는 '9/30 23:59 확정'.
 */
export function ChuseokEventClient({ initialTab, songpyeon, board }: { initialTab: ChuseokTab; songpyeon: SongpyeonOverview; board: ContestBoard }) {
  const [tab, setTab] = useState<ChuseokTab>(initialTab);
  const [now, setNow] = useState<number | null>(null);
  const live = board.phase === 'accrue';
  useEffect(() => {
    if (!live) return;
    // 첫 값은 다음 프레임에(하이드레이션 불일치 회피), 이후 1초마다.
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [live]);
  const right =
    board.phase === 'before' ? '9/24 00:00 시작' : live ? (now === null ? ' ' : `${fmtLeft(CHUSEOK_ACCRUE_END_MS - now)} 남음`) : '9/30 23:59 확정';
  // 송편 탭에 받을 도달 보상 수를 붉은 배지로(2026-09-23 UX 점검) — 순위 탭에 있다가 놓치지 않게. 기간 밖엔 없음.
  const claimable = songpyeon.phase === 'accrue' || songpyeon.phase === 'claim' ? songpyeon.claimable : 0;
  const tabs = [
    { key: 'rank' as const, label: '강화 순위' },
    { key: 'songpyeon' as const, label: '송편 교환', badge: claimable > 0 ? claimable : undefined },
  ];
  return (
    <div className="px-4 pb-4 pt-3">
      <PageHeader title="추석 강화 이벤트" fallback="/" right={<span className="text-[11.5px] font-bold tabular-nums text-amber-400">{right}</span>} />
      <div className="mt-3">
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </div>
      {tab === 'rank' ? <RankPanel board={board} /> : <SongpyeonPanel initial={songpyeon} />}
    </div>
  );
}
