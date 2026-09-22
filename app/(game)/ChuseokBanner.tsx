'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { assetUrl } from '@/lib/asset-versions';
import { CHUSEOK_ACCRUE_END_MS } from '@/lib/game/chuseok/config';
import { fmtLeft } from '@/lib/game/chuseok/countdown';

/**
 * 홈 §1 — 추석 배너(캐러셀 슬라이드). 평소엔 대회(한옥 마당 배경, 초 단위 남은 시간),
 * 받을 도달 보상이 있으면 송편(자줏빛 달 배경)으로 문구·배경이 바뀌고 송편 세그먼트로 간다.
 * 프레임리스(h-full) — 테두리/라운드는 carousel outer가 제공.
 */
export function ChuseokBanner({ claimable, phase }: { claimable: number; phase: 'accrue' | 'claim' }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // 첫 값은 다음 프레임에(하이드레이션 불일치·효과 안 동기 setState 회피), 이후 1초마다.
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);
  const hot = claimable > 0;
  const href = hot ? '/event/chuseok?tab=songpyeon' : '/event/chuseok';
  const bg = hot ? '/sprites/chuseok/banner-songpyeon.png' : '/sprites/chuseok/banner-contest.png';
  const right =
    hot ? '받기' : phase === 'accrue' ? (now === null ? '' : fmtLeft(CHUSEOK_ACCRUE_END_MS - now)) : '9/30 23:59 확정';
  return (
    <Link prefetch={false} href={href} className="relative flex h-full w-full min-w-0 items-center isolate overflow-hidden transition active:scale-[0.99]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(bg)} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="relative z-10 flex w-full items-center gap-2 px-3.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? '송편 보상을 받을 수 있어요' : '추석 강화 이벤트'}
          </div>
          <div className="truncate text-[10.5px] text-amber-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {hot ? `추석 강화 이벤트 · 받을 보상 ${claimable}개` : '추석 장비 6종, 장비마다 10등까지 보상'}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-black/40 px-2 py-1 font-mono text-[10.5px] font-extrabold tabular-nums text-amber-200">{right}</span>
      </div>
    </Link>
  );
}
