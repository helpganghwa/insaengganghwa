import Link from 'next/link';

import type { LayoutData } from '@/lib/game/layout-data';
import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import { NicknameEditor } from '@/app/(game)/me/NicknameEditor';
import { DiamondInitializer } from '@/components/DiamondContext';
import { HeaderDiamond } from '@/components/HeaderDiamond';
import { GuildBadge } from '@/components/GuildBadge';
import { ExecutorTag } from '@/components/ExecutorTag';

/**
 * WIREFRAMES §0 — 좌: ⚒️ 인생강화 / 우: 📬(미수령 dot) · 닉네임 · 💎 다이아.
 * 프레젠테이션 셸: 값만 받아 렌더(데이터 미도착 시 Suspense fallback으로도 사용).
 * 데이터 fetch는 AppHeader(async)가 Suspense 경계 안에서 수행 — 콜드여도 헤더 셸 즉시.
 */
export function AppHeaderShell({
  nickname = '플레이어',
  nicknameChangedCount = 0,
  diamond = 0n,
  profileSouth = null,
  profileFaceBox = null,
  guildEmblemUrl = null,
  executorZone = null,
  executorZoneRegion = null,
  stats = null,
  diamondSlot,
}: {
  nickname?: string;
  nicknameChangedCount?: number;
  diamond?: bigint;
  profileSouth?: string | null;
  /** 활성 프로필 얼굴 박스(검수 산출) — 썸네일 정밀 크롭. 없으면 폴백 크롭. */
  profileFaceBox?: FaceBox | null;
  guildEmblemUrl?: string | null;
  executorZone?: string | null;
  executorZoneRegion?: string | null;
  /** 닉네임 아래 서브라인 — 전투력·최고강화·합산강화(2026-07-21 문의 반영). null=미표시(fallback 셸). */
  stats?: { combat: number; maxEnhance: number; sumEnhance: number } | null;
  /** AppHeader(server)가 client HeaderDiamond를 주입 — Suspense fallback은 정적 표시. */
  diamondSlot?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 box-content flex h-12 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 pt-[env(safe-area-inset-top)] dark:border-zinc-800 dark:bg-zinc-950">
      {/* 아바타 클릭=아바타 선택(/me/profiles), 이름 클릭=닉네임 변경 팝업. */}
      <div className="flex min-w-0 items-center gap-2">
        <Link prefetch={false}
          href="/me/profiles"
          aria-label="아바타 선택"
          className="relative h-8 w-8 shrink-0 overflow-hidden"
        >
          {profileSouth ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileSouth}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={faceCropStyle(profileFaceBox)}
            />
          ) : (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-base leading-none"
            >
              👤
            </span>
          )}
        </Link>
        {/* 이름↔문양은 좁게(gap-1), 아바타↔이름은 기존 gap-2 유지. 스탯 있으면 이름 아래 서브라인 2단. */}
        <span className="flex min-w-0 flex-col justify-center leading-tight">
          <span className="flex min-w-0 items-center gap-1">
            <NicknameEditor
              current={nickname}
              changedCount={nicknameChangedCount}
              diamond={String(diamond)}
              className="!text-[13px] text-zinc-800 dark:text-zinc-100"
            />
            <GuildBadge emblemUrl={guildEmblemUrl} size={18} className="shrink-0" />
            {/* 집행관(2026-07-22) — shrink-0이라 폭이 모자라면 닉네임이 먼저 말줄임된다. */}
            <ExecutorTag zone={executorZone} region={executorZoneRegion} className="text-[9px] font-bold" />
          </span>
          {stats ? (
            // 서브라인 — 라벨은 흐리게, 수치는 앰버 강조(문의 채택안 B, 2026-07-21).
            <span className="truncate font-mono text-[9px] font-bold text-zinc-500 dark:text-zinc-400">
              전투력{' '}
              <b className="font-extrabold text-amber-600 dark:text-amber-300">
                {stats.combat.toLocaleString('ko-KR')}
              </b>
              {' · '}최고{' '}
              <b className="font-extrabold text-amber-600 dark:text-amber-300">+{stats.maxEnhance}</b>
              {' · '}합산{' '}
              <b className="font-extrabold text-amber-600 dark:text-amber-300">+{stats.sumEnhance}</b>
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        {diamondSlot ?? (
          <Link prefetch={false}
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
        nicknameChangedCount={d.nicknameChangedCount}
        diamond={d.diamond}
        profileSouth={d.profileSouth}
        profileFaceBox={d.profileFaceBox}
        guildEmblemUrl={d.guildEmblemUrl}
        executorZone={d.executorZone}
        executorZoneRegion={d.executorZoneRegion}
        stats={d.stats}
        diamondSlot={<HeaderDiamond />}
      />
    </>
  );
}
