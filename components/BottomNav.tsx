'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { modalHistory } from '@/lib/ui/modal-history';

// WIREFRAMES §0 — 5탭: 홈/인벤토리/강화/길드/프로필.
// 레이드·대난투·보급·우편함·월드맵·상점은 홈 그리드 진입(BottomNav 제외).
const items = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/inventory', label: '인벤토리', icon: '🎒' },
  { href: '/enhance', label: '강화', icon: '⚒️' },
  { href: '/guild', label: '길드', icon: '🏰' },
  { href: '/me', label: '프로필', icon: '👤' },
] as const;

type Props = {
  /** /enhance 탭 알림 dot — 완료 시점 도달 강화 1건 이상. */
  hasCompletedEnhance?: boolean;
  /** /me 탭 알림 dot — 친구 받은 요청 1건 이상. */
  hasFriendRequest?: boolean;
};

export function BottomNav({
  hasCompletedEnhance = false,
  hasFriendRequest = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="sticky bottom-0 z-30 box-content grid h-14 grid-cols-5 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
      {items.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const dot =
          (item.href === '/enhance' && hasCompletedEnhance) ||
          (item.href === '/me' && hasFriendRequest);
        return (
          <Link prefetch={false}
            key={item.href}
            href={item.href}
            // 채팅창이 열려 있으면 GNB 탭에 최소화 — ChatDock이 수신. 목적지 href를 실어
            // 같은 경로 재탭(내비 없음)만 즉시 닫고, 실제 이동은 pathname 전환과 동시에 닫는다
            // (닫힘→이동 순서로 옛 페이지가 잠깐 보이던 어지러움 제거, 2026-07-22).
            onClick={(e) => {
              window.dispatchEvent(new CustomEvent('ig:gnb-nav', { detail: item.href }));
              // 채팅창(또는 팝업)이 히스토리 항목을 쌓아 둔 채 다른 탭으로 가면 그 항목이 새 화면 밑에 남아
              // 뒤로가기가 한 번 더 든다([A, 채팅, B]). 열린 항목이 있으면 그 항목 자리에 새 화면을 바꿔치기해
              // [A, B]가 되게 한다(2026-10-14 검수 A-1). 같은 경로 재탭은 이동이 없으니 그대로(ChatDock이 닫는다).
              if (modalHistory.hasOpen() && !active) {
                e.preventDefault();
                router.replace(item.href);
              }
            }}
            data-tut={
              item.href === '/inventory'
                ? 'nav-inventory'
                : item.href === '/enhance'
                  ? 'nav-enhance'
                  : undefined
            }
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
