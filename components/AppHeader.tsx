import Link from 'next/link';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { mailbox } from '@/lib/db/schema/mailbox';
import { withTimeout } from '@/lib/db/with-timeout';
import { formatCompactKR } from '@/lib/ui/format-number';
import { MailButton } from '@/components/MailButton';

/**
 * WIREFRAMES §0 — 좌: ⚒️ 인생강화 / 우: 닉네임 · ✉️ 우편 · 🏆 랭킹 · 💎 다이아.
 * userId는 (game) layout에서 세션 검증(로컬 JWT §11.1) 후 주입.
 * 우편 미수령(미만료) 카운트는 짧은 timeout 가드 — 실패 시 dot 미표시.
 */
export async function AppHeader({ userId }: { userId: string }) {
  const [profile, unreadMail] = await Promise.all([
    db
      .select({ nickname: profiles.nickname, diamond: profiles.diamond })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    withTimeout(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(mailbox)
        .where(
          and(eq(mailbox.userId, userId), isNull(mailbox.claimedAt), gt(mailbox.expiresAt, sql`now()`)),
        ),
      3000,
      'header.unreadMail',
    ).catch(() => [{ n: 0 }] as { n: number }[]),
  ]);

  const nickname = profile[0]?.nickname ?? '플레이어';
  const diamond = profile[0]?.diamond ?? 0n;
  const mailCount = Number(unreadMail[0]?.n ?? 0);
  const mailBadge = mailCount > 9 ? '9+' : mailCount > 0 ? String(mailCount) : null;

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
        <MailButton mailBadge={mailBadge} />
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
