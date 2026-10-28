'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { assetUrl } from '@/lib/asset-versions';
import { HALLOWEEN_ACCRUE_END_LABEL, HALLOWEEN_ACCRUE_END_MS, HALLOWEEN_CLAIM_END_LABEL } from '@/lib/game/halloween/config';
import { fmtLeft } from '@/lib/game/halloween/countdown';
import { serverNow } from '@/lib/client/server-clock';

/**
 * 홈 §1 — 할로윈 배너(캐러셀 슬라이드). 평소엔 대회(호박밭 배경, 초 단위 남은 시간), 받을 도달 보상이 있으면
 * 사탕 문구·배경(사탕 바구니)으로 바뀌고 사탕 세그먼트로 간다. 추석 배너(ChuseokBanner)와 같은 틀.
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
  // 배경(2026-10-27 확정, pixflux 384×128): 평소 호박밭 밤 풍경, 받을 보상이 있으면 사탕이 넘치는 호박 바구니.
  const bg = hot ? '/sprites/halloween/banner-candy.png' : '/sprites/halloween/banner-contest.png';
  const right =
    hot ? '받기' : phase === 'accrue' && !(now !== null && HALLOWEEN_ACCRUE_END_MS - now <= 0) ? (now === null ? '' : fmtLeft(HALLOWEEN_ACCRUE_END_MS - now)) : `${HALLOWEEN_ACCRUE_END_LABEL} 확정`;
  return (
    <Link prefetch={false} href={href} className="relative flex h-full w-full min-w-0 items-center isolate overflow-hidden transition active:scale-[0.99]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(bg)} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="relative z-10 flex w-full items-center gap-2 px-3.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? '사탕 보상을 받을 수 있어요' : '할로윈 강화 이벤트'}
          </div>
          <div className="truncate text-[10.5px] text-amber-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? `할로윈 강화 이벤트 · 받을 보상 ${claimable}개` : phase === 'claim' ? `남은 사탕은 ${HALLOWEEN_CLAIM_END_LABEL}까지 바꿀 수 있어요` : '할로윈 장비 6종, 장비마다 10등까지 보상'}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-black/40 px-2 py-1 font-mono text-[10.5px] font-extrabold tabular-nums text-amber-200">{right}</span>
      </div>
    </Link>
  );
}
