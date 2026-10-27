'use client';

import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { assetUrl } from '@/lib/asset-versions';
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
  const rightText =
    board.phase === 'before' ? `${HALLOWEEN_START_LABEL} 시작` : live ? (now === null ? ' ' : `${fmtLeft(HALLOWEEN_ACCRUE_END_MS - now)} 남음`) : `${HALLOWEEN_ACCRUE_END_LABEL} 확정`;
  // 남은 시간 칩 — 대회 중엔 주황 유리, 결과 기간엔 보라(2026-10-27 UI 시안 9).
  const chip = live
    ? 'border-orange-400/50 bg-orange-500/25 text-amber-100 shadow-[0_0_12px_rgba(249,115,22,.35)]'
    : 'border-violet-400/50 bg-violet-500/25 text-violet-100 shadow-[0_0_12px_rgba(139,92,246,.35)]';
  const right = <span className={`inline-block min-w-[104px] rounded-lg border px-2 py-1 text-center font-mono text-[11px] font-extrabold tabular-nums backdrop-blur-sm ${chip}`}>{rightText}</span>;
  // 사탕 탭에 받을 도달 보상 수를 붉은 배지로(2026-09-23 UX 점검) — 순위 탭에 있다가 놓치지 않게. 기간 밖엔 없음.
  const claimable = candy.phase === 'accrue' || candy.phase === 'claim' ? candy.claimable : 0;
  const tabs = [
    { key: 'rank' as const, label: '강화 순위' },
    { key: 'candy' as const, label: '사탕 교환', badge: claimable > 0 ? claimable : undefined },
  ];
  return (
    // 이벤트 페이지만 밤보라 톤(2026-10-27 UI 시안 2) — 카드·테두리 색은 각 패널에서 같은 팔레트를 쓴다.
    // flex-1: main이 flex-col이라 내용이 짧아도 밤보라 배경이 화면 끝까지 간다. 하단 여백은 채팅 미니바 높이(--chat-dock-h)만큼 더한다.
    <div className="flex-1 bg-[#0f0b16] pb-[calc(24px+var(--chat-dock-h,0px))]">
      {/* 헤더 뒤에 호박밭 그림(홈 배너와 같은 그림) + 아래로 녹는 그라데이션(시안 1). */}
      <div className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl('/sprites/halloween/banner-contest.png')} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover opacity-90" style={{ imageRendering: 'pixelated' }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/35 via-[#0f0b16]/55 to-[#0f0b16]" />
        <div className="relative px-4 pb-2 pt-3">
          <PageHeader title={<span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">할로윈 강화 이벤트</span>} fallback="/" right={right} />
          <div className="mt-3">
            <Tabs items={tabs} value={tab} onChange={setTab} className="!bg-black/45 border border-violet-300/15 backdrop-blur-sm" />
          </div>
        </div>
      </div>
      <div className="px-4">{tab === 'rank' ? <RankPanel board={board} /> : <CandyPanel initial={candy} />}</div>
    </div>
  );
}
