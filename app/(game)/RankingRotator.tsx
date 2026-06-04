'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { LeaderboardEntry, LeaderboardMetric } from '@/lib/game/leaderboard/queries';

/**
 * 홈 랭킹 카드 로테이터 — 5초마다 다음 메트릭으로 전환(고정 순서, 첫 노출만 랜덤).
 * 덱·시작 인덱스는 서버(RankingTop3Card)에서 주입(hydration 일치).
 */
const HOF_BG = '/sprites/hof-bg.png?v=3';
const HEADER_BG = '/sprites/hof-header.png';
const ROTATE_MS = 5000;

export type RankingDeck = {
  metric: LeaderboardMetric;
  label: string;
  top: LeaderboardEntry[];
};

export function RankingRotator({
  decks,
  initialIndex,
}: {
  decks: RankingDeck[];
  initialIndex: number;
}) {
  const [idx, setIdx] = useState(initialIndex);
  useEffect(() => {
    if (decks.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % decks.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [decks.length]);

  const deck = decks[idx % decks.length]!;
  const top = deck.top;

  return (
    <section
      aria-label={`${deck.label} 랭킹`}
      className="overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40"
    >
      {/* 헤더 — pixellab 배너 배경 + 해당 메트릭 랭킹 진입 */}
      <Link
        href={`/leaderboard?tab=${deck.metric}`}
        className="relative flex items-center justify-center overflow-hidden border-b border-amber-700/40 px-3.5 py-1.5 transition hover:brightness-110"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HEADER_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 bg-black/35" />
        <span
          key={deck.metric}
          className="relative text-[10px] font-bold text-amber-100 text-pixel-outline"
          style={{ animation: 'toast-pop 0.3s ease-out' }}
        >
          {deck.label} 랭킹
        </span>
      </Link>

      <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOF_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-[105%] w-full object-fill"
          style={{ imageRendering: 'pixelated' }}
        />
        <div key={deck.metric} className="absolute inset-0 flex items-end justify-center gap-0.5 px-1 py-1.5">
          {/* 항상 3분할 — 2/1/3 자리. 데이터 없으면 placeholder로 슬롯 유지. */}
          {[
            { slot: 2 as const, entry: top[1] ?? null },
            { slot: 1 as const, entry: top[0] ?? null },
            { slot: 3 as const, entry: top[2] ?? null },
          ].map(({ slot, entry }) => {
            const first = slot === 1;
            if (!entry) {
              return (
                <div
                  key={`empty-${slot}`}
                  className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                    first ? 'z-10' : ''
                  }`}
                >
                  <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                    <span className="font-mono text-[11px] leading-none tabular-nums text-white/55 text-pixel-outline">
                      #{slot}
                    </span>
                    <span className="truncate text-[11px] font-medium text-white/55 text-pixel-outline">
                      —
                    </span>
                  </div>
                  <div className="relative w-full flex-1" aria-hidden />
                  <span className="pb-1 font-mono text-[11px] font-bold tabular-nums text-amber-200/55 text-pixel-outline">
                    —
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={entry.userId}
                href={`/u/${encodeURIComponent(entry.publicCode)}`}
                className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                  first ? 'z-10' : ''
                }`}
              >
                <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                  <span className="font-mono text-[11px] font-bold leading-none tabular-nums text-amber-300 text-pixel-outline">
                    #{entry.rank}
                  </span>
                  <span className="truncate text-[11px] font-medium text-white text-pixel-outline">
                    {entry.nickname}
                  </span>
                </div>
                <div className="relative w-full flex-1">
                  {entry.profileImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.profileImg}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain object-bottom"
                      style={{
                        imageRendering: 'pixelated',
                        transform: 'scale(1.49) translateY(calc(5% + 15px))',
                        transformOrigin: 'center bottom',
                        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
                      }}
                    />
                  ) : null}
                </div>
                <span className="pb-1 font-mono text-[11px] font-bold tabular-nums text-amber-200 text-pixel-outline">
                  {entry.value.toLocaleString('ko-KR')}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
