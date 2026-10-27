'use client';

import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { HALLOWEEN_ACCRUE_END_LABEL, HALLOWEEN_ACCRUE_END_MS, HALLOWEEN_START_LABEL } from '@/lib/game/halloween/config';
import { fmtLeft } from '@/lib/game/halloween/countdown';
import { serverNow } from '@/lib/client/server-clock';
import type { ContestBoard } from '@/lib/game/halloween/contest';
import type { CandyOverview } from '@/lib/game/halloween/candy';

import { RankPanel } from './RankPanel';
import { CandyPanel } from './CandyPanel';

export type HalloweenTab = 'rank' | 'candy';


/**
 * 할로윈 강화 이벤트 페이지 — 헤더 오른쪽에 초 단위 남은 시간(홈 배너와 같은 형식), 세그먼트 두 개(순위 | 사탕).
 * 전환은 상태만 바꾼다(무왕복). 마감 뒤에는 '11/4 11:59 확정'.
 */
export function HalloweenEventClient({ initialTab, candy, board }: { initialTab: HalloweenTab; candy: CandyOverview; board: ContestBoard }) {
  const [tab, setTab] = useState<HalloweenTab>(initialTab);
  const [now, setNow] = useState<number | null>(null);
  const live = board.phase === 'accrue';
  useEffect(() => {
    if (!live) return;
    // 첫 값은 다음 프레임에(하이드레이션 불일치 회피), 이후 1초마다.
    const raf = requestAnimationFrame(() => setNow(serverNow()));
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [live]);
  const right =
    board.phase === 'before' ? `${HALLOWEEN_START_LABEL} 시작` : live ? (now === null ? ' ' : `${fmtLeft(HALLOWEEN_ACCRUE_END_MS - now)} 남음`) : `${HALLOWEEN_ACCRUE_END_LABEL} 확정`;
  // 사탕 탭에 받을 도달 보상 수를 붉은 배지로(2026-09-23 UX 점검) — 순위 탭에 있다가 놓치지 않게. 기간 밖엔 없음.
  const claimable = candy.phase === 'accrue' || candy.phase === 'claim' ? candy.claimable : 0;
  const tabs = [
    { key: 'rank' as const, label: '강화 순위' },
    { key: 'candy' as const, label: '사탕 교환', badge: claimable > 0 ? claimable : undefined },
  ];
  return (
    <div className="px-4 pb-4 pt-3">
      <PageHeader title="할로윈 강화 이벤트" fallback="/" right={<span className="text-[11.5px] font-bold tabular-nums text-amber-400">{right}</span>} />
      <div className="mt-3">
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </div>
      {tab === 'rank' ? <RankPanel board={board} /> : <CandyPanel initial={candy} />}
    </div>
  );
}
