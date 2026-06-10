import Link from 'next/link';

import type { LayoutData } from '@/lib/game/layout-data';
import { DiamondInitializer } from '@/components/DiamondContext';
import { HeaderDiamond } from '@/components/HeaderDiamond';
import { GuildBadge } from '@/components/GuildBadge';

/**
 * WIREFRAMES §0 — 좌: ⚒️ 인생강화 / 우: 📬(미수령 dot) · 닉네임 · 💎 다이아.
 * 프레젠테이션 셸: 값만 받아 렌더(데이터 미도착 시 Suspense fallback으로도 사용).
 * 데이터 fetch는 AppHeader(async)가 Suspense 경계 안에서 수행 — 콜드여도 헤더 셸 즉시.
 */
export function AppHeaderShell({
  nickname = '플레이어',
  diamond = 0n,
  profileSouth = null,
  guildEmblemUrl = null,
  diamondSlot,
}: {
  nickname?: string;
  diamond?: bigint;
  profileSouth?: string | null;
  guildEmblemUrl?: string | null;
  /** AppHeader(server)가 client HeaderDiamond를 주입 — Suspense fallback은 정적 표시. */
  diamondSlot?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 box-content flex h-12 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 pt-[env(safe-area-inset-top)] dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/me" className="flex min-w-0 items-center gap-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden">
          {profileSouth ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileSouth}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={{
                imageRendering: 'pixelated',
                objectFit: 'cover',
                objectPosition: '50% 0%',
                transform: 'scale(3.6)',
                transformOrigin: '50% 22%',
              }}
            />
          ) : (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-base leading-none"
            >
              👤
            </span>
          )}
        </div>
        <span className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
          {nickname}
        </span>
        <GuildBadge emblemUrl={guildEmblemUrl} size={18} className="shrink-0" />
      </Link>

      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        {diamondSlot ?? (
          <Link
            href="/shop?tab=charge"
            aria-label={`다이아 ${diamond} · 충전`}
            className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-100"
          >
            <span aria-hidden>💎</span>
            <span className="font-mono tabular-nums">{diamond.toLocaleString('ko-KR')}</span>
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * Suspense 경계 안에서 셸 데이터 await — 절대 throw 안 함(loadLayoutData가 흡수).
 * 다이아 표시는 HeaderDiamond(client, useDiamond)로 분리하여 보석 단축 등 낙관 갱신 반영.
 */
export async function AppHeader({ dataPromise }: { dataPromise: Promise<LayoutData> }) {
  const d = await dataPromise;
  return (
    <>
      <DiamondInitializer diamond={d.diamond} />
      <AppHeaderShell
        nickname={d.nickname}
        diamond={d.diamond}
        profileSouth={d.profileSouth}
        guildEmblemUrl={d.guildEmblemUrl}
        diamondSlot={<HeaderDiamond />}
      />
    </>
  );
}
