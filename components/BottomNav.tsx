'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// WIREFRAMES §0 + SCREEN-ANALYSIS §1.3 P0-2(2026-05-25):
// 5탭 — 홈/강화/우편함/레이드/프로필. 인벤토리는 강화 picker·프로필 내부로 진입.
// 우편함이 1-tap(비동기 보상 도달성 ↑).
const items = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/enhance', label: '강화', icon: '⚒️' },
  { href: '/mail', label: '우편함', icon: '📬' },
  { href: '/raid', label: '레이드', icon: '⚔️' },
  { href: '/me', label: '프로필', icon: '👤' },
] as const;

type Props = {
  /** /enhance 탭 알림 dot — 완료 시점 도달 강화 1건 이상. */
  hasCompletedEnhance?: boolean;
  /** /mail 탭 알림 dot — 미수령(미만료) 우편 1건 이상. */
  hasUnreadMail?: boolean;
};

export function BottomNav({
  hasCompletedEnhance = false,
  hasUnreadMail = false,
}: Props) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-30 box-content grid h-14 grid-cols-5 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
      {items.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const dot =
          (item.href === '/enhance' && hasCompletedEnhance) ||
          (item.href === '/mail' && hasUnreadMail);
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
