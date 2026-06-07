'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { LeaderboardEntry, LeaderboardMetric } from '@/lib/game/leaderboard/queries';

/**
 * 홈 §1 — Top 3 명예의 전당 카드(클라이언트). 5종 덱을 미리 받아 표시 타입을 state로 소유 →
 * 하이드레이션 후 재랜덤 없음(깜박임 제거). 첫 타입은 서버가 고른 랜덤(initialIndex).
 * 헤더 ◀/▶로 타입 전환(미리 받은 데이터라 즉시), 타이틀은 해당 랭킹 진입.
 */
const HOF_BG = '/sprites/hof-bg.png?v=3';
const HEADER_BG = '/sprites/hof-header.png';

export type RankingDeckData = { metric: LeaderboardMetric; label: string; top: LeaderboardEntry[] };

export function RankingDeck({
  decks,
  initialIndex,
}: {
  decks: RankingDeckData[];
  initialIndex: number;
}) {
  const [i, setI] = useState(() =>
    Math.min(Math.max(0, Math.floor(initialIndex)), decks.length - 1),
  );
  const deck = decks[i]!;
  const { label, metric, top } = deck;
  const multi = decks.length > 1;
  const go = (delta: number) => setI((cur) => (cur + delta + decks.length) % decks.length);

  return (
    <section
      aria-label={`${label} 랭킹`}
      className="overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40"
    >
      {/* 헤더 — ◀ · 타이틀(랭킹 진입) · ▶ */}
      <div className="relative flex items-center border-b border-amber-700/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HEADER_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 bg-black/35" />
        {multi ? (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="이전 랭킹"
            className="relative z-10 px-3 py-1.5 text-[12px] font-bold text-amber-100 text-pixel-outline transition active:scale-90 hover:brightness-125"
          >
            {'◀︎'}
          </button>
        ) : (
          <span className="w-9 shrink-0" />
        )}
        <Link
          href={`/leaderboard?tab=${metric}`}
          className="relative z-10 flex-1 py-1.5 text-center transition hover:brightness-110"
        >
          <span className="text-[10px] font-bold text-amber-100 text-pixel-outline">
            {label} 랭킹
          </span>
        </Link>
        {multi ? (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="다음 랭킹"
            className="relative z-10 px-3 py-1.5 text-[12px] font-bold text-amber-100 text-pixel-outline transition active:scale-90 hover:brightness-125"
          >
            {'▶︎'}
          </button>
        ) : (
          <span className="w-9 shrink-0" />
        )}
      </div>

      <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOF_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-[105%] w-full object-fill"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 flex items-end justify-center gap-0.5 px-1 py-1.5">
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
