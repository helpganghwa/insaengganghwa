import Link from 'next/link';

import { getRankingTop } from '@/lib/game/leaderboard/queries';

/**
 * 홈 §1 — 최고 강화 Top 3 카드 (SCREEN-ANALYSIS §6 수정 결정 2026-05-25).
 * 단일 metric(최고 강화) 1·2·3위 노출 + 전체 랭킹 진입.
 */

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export async function RankingTop3Card() {
  const top = await getRankingTop('max', 3);
  if (top.length === 0) return null;

  return (
    <section
      aria-label="최고 강화 랭킹"
      className="overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-b from-stone-900 to-stone-950"
    >
      <header className="flex items-baseline justify-between border-b border-amber-900/30 px-3.5 py-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-amber-200">
          <span aria-hidden>🏆</span>
          <span>최고 강화 랭킹</span>
        </h2>
        <Link
          href="/leaderboard"
          className="text-[10px] font-medium text-amber-300/80 hover:text-amber-200"
        >
          전체 →
        </Link>
      </header>
      <ul className="divide-y divide-amber-900/20">
        {top.map((entry, i) => (
          <li
            key={entry.userId}
            className="flex items-center gap-2.5 px-3.5 py-2.5"
          >
            <span aria-hidden className="shrink-0 text-base leading-none">
              {MEDALS[i] ?? '·'}
            </span>
            <Link
              href={`/u/${encodeURIComponent(entry.nickname)}`}
              className="min-w-0 flex-1 truncate text-[12px] font-semibold text-amber-50/95 hover:text-amber-100"
            >
              {entry.nickname}
            </Link>
            <span className="shrink-0 text-[12px] font-bold text-amber-200 tabular-nums">
              +{entry.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
