'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// WIREFRAMES §0 — 5탭: 홈/레이드/강화/상점/프로필.
// 우편함·인벤토리는 홈 그리드 진입(BottomNav 제외).
const items = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/raid', label: '레이드', icon: '⚔️' },
  { href: '/enhance', label: '강화', icon: '⚒️' },
  { href: '/shop', label: '상점', icon: '🛒' },
  { href: '/me', label: '프로필', icon: '👤' },
] as const;

type Props = {
  /** /enhance 탭 알림 dot — 완료 시점 도달 강화 1건 이상. */
  hasCompletedEnhance?: boolean;
};

export function BottomNav({ hasCompletedEnhance = false }: Props) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-30 box-content grid h-14 grid-cols-5 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
      {items.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const dot = item.href === '/enhance' && hasCompletedEnhance;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'relative flex flex-col items-center justify-center gap-0.5 text-xs font-semibold text-zinc-900 dark:text-zinc-50'
                : 'relative flex flex-col items-center justify-center gap-0.5 text-xs text-zinc-600 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100'
            }
          >
            <span aria-hidden className="relative text-lg leading-none">
              {item.icon}
              {dot ? (
                <span
                  aria-label="알림"
                  className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950"
                />
              ) : null}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
