import Link from 'next/link';

/**
 * WIREFRAMES §1 — 홈 (메뉴 허브). 2×3 그리드 + 오늘의 보급.
 * 장비/강화 현황 정보 없음(강화 화면 전용).
 */
const MENU = [
  { href: '/enhance', label: '강화', icon: '⚒️' },
  { href: '/inventory', label: '인벤토리', icon: '🎒' },
  { href: '/gacha', label: '보급', icon: '📦' },
  { href: '/raid', label: '레이드', icon: '⚔️' },
  { href: '/me', label: '프로필', icon: '👤' },
  { href: '/leaderboard', label: '랭킹', icon: '🏆' },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-center transition active:scale-[0.98] hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            <span aria-hidden className="text-3xl">
              {m.icon}
            </span>
            <span className="text-sm font-semibold">{m.label}</span>
          </Link>
        ))}
      </div>

      {/* 오늘의 보급 — 일일 무료 보급 상자 (수령 ledger는 후속: daily 클레임 테이블 필요) */}
      <Link
        href="/gacha"
        className="flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            🎁 오늘의 보급
          </span>
          <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
            무기/방어구/장신구 보급 상자
          </span>
        </span>
        <span className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950">
          받으러 가기 →
        </span>
      </Link>
    </div>
  );
}
