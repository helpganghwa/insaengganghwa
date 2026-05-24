import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * WIREFRAMES §0 — 좌: ⚒️ 인생강화 / 우: 닉네임 · 🏆 랭킹 · 💎 다이아.
 * userId는 (game) layout에서 세션 검증(로컬 JWT §11.1) 후 주입.
 * 우편함은 홈 메뉴 카드(/mail)로 진입.
 */
export async function AppHeader({ userId }: { userId: string }) {
  const [profile] = await db
    .select({ nickname: profiles.nickname, diamond: profiles.diamond })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  const nickname = profile?.nickname ?? '플레이어';
  const diamond = profile?.diamond ?? 0n;

  return (
    <header className="sticky top-0 z-30 box-content flex h-14 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 pt-[env(safe-area-inset-top)] dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="text-lg leading-none">
          ⚒️
        </span>
        <span className="text-sm font-bold tracking-tight">인생강화</span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="max-w-[68px] truncate text-zinc-700 dark:text-zinc-200">
          {nickname}
        </span>
        {/* 랭킹 순위 숫자는 leaderboard 쿼리 구현 시 표기 (현재 링크만). */}
        <Link
          href="/leaderboard"
          aria-label="랭킹"
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <span aria-hidden>🏆</span>
        </Link>
        <Link
          href="/shop"
          aria-label={`다이아 ${diamond} · 충전`}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <span aria-hidden>💎</span>
          <span className="font-mono tabular-nums">{formatCompactKR(diamond)}</span>
          <span aria-hidden className="text-[10px] text-amber-600 dark:text-amber-400">＋</span>
        </Link>
      </div>
    </header>
  );
}
