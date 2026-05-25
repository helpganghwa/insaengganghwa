import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { formatCompactKR } from '@/lib/ui/format-number';

/**
 * WIREFRAMES §0 — 좌: ⚒️ 인생강화 / 우: 📬(미수령 dot) · 닉네임 · 💎 다이아.
 * userId는 (game) layout에서 세션 검증(로컬 JWT §11.1) 후 주입.
 * 우편 아이콘은 SCREEN-ANALYSIS §1.3 P0-2(2026-05-25) 도달성 개선.
 */
export async function AppHeader({
  userId,
  hasUnreadMail = false,
}: {
  userId: string;
  hasUnreadMail?: boolean;
}) {
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
        <Link
          href="/mail"
          aria-label={hasUnreadMail ? '우편함 (미수령 있음)' : '우편함'}
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
        >
          <span aria-hidden className="text-base leading-none">📬</span>
          {hasUnreadMail ? (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950"
            />
          ) : null}
        </Link>
        <span className="text-zinc-700 dark:text-zinc-200">{nickname}</span>
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
