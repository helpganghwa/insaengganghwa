'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { HALLOWEEN_ACCRUE_END_LABEL, HALLOWEEN_ACCRUE_END_MS } from '@/lib/game/halloween/config';
import { fmtLeft } from '@/lib/game/halloween/countdown';
import { serverNow } from '@/lib/client/server-clock';

/**
 * 홈 §1 — 할로윈 배너(캐러셀 슬라이드). 평소엔 대회(초 단위 남은 시간), 받을 도달 보상이 있으면
 * 사탕 문구·배경으로 바뀌고 사탕 세그먼트로 간다. 추석 배너(ChuseokBanner)와 같은 틀.
 * 프레임리스(h-full) — 테두리/라운드는 carousel outer가 제공.
 */
export function HalloweenBanner({ claimable, phase }: { claimable: number; phase: 'accrue' | 'claim' }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // 첫 값은 다음 프레임에(하이드레이션 불일치·효과 안 동기 setState 회피), 이후 1초마다.
    const raf = requestAnimationFrame(() => setNow(serverNow()));
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);
  const hot = claimable > 0;
  const href = hot ? '/event/halloween?tab=candy' : '/event/halloween';
  // 배경 그림은 아직 없어(2026-10-25 임시) 그라데이션으로 — 평소 밤하늘 보라, 받을 보상이 있으면 호박 주황.
  const bg = hot ? 'bg-gradient-to-r from-orange-700 via-amber-700 to-purple-900' : 'bg-gradient-to-r from-purple-950 via-indigo-950 to-orange-900';
  const right =
    hot ? '받기' : phase === 'accrue' ? (now === null ? '' : fmtLeft(HALLOWEEN_ACCRUE_END_MS - now)) : `${HALLOWEEN_ACCRUE_END_LABEL} 확정`;
  return (
    <Link prefetch={false} href={href} className="relative flex h-full w-full min-w-0 items-center isolate overflow-hidden transition active:scale-[0.99]">
      <div aria-hidden className={`absolute inset-0 ${bg}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="relative z-10 flex w-full items-center gap-2 px-3.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? '사탕 보상을 받을 수 있어요' : '할로윈 강화 이벤트'}
          </div>
          <div className="truncate text-[10.5px] text-amber-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? `할로윈 강화 이벤트 · 받을 보상 ${claimable}개` : '할로윈 장비 6종, 장비마다 10등까지 보상'}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-black/40 px-2 py-1 font-mono text-[10.5px] font-extrabold tabular-nums text-amber-200">{right}</span>
      </div>
    </Link>
  );
}
