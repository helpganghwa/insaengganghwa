import Link from 'next/link';

import type { LayoutData } from '@/lib/game/layout-data';
import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import { NicknameEditor } from '@/app/(game)/me/NicknameEditor';
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
  nicknameChangedCount = 0,
  diamond = 0n,
  profileSouth = null,
  profileFaceBox = null,
  guildEmblemUrl = null,
  diamondSlot,
}: {
  nickname?: string;
  nicknameChangedCount?: number;
  diamond?: bigint;
  profileSouth?: string | null;
  /** 활성 프로필 얼굴 박스(검수 산출) — 썸네일 정밀 크롭. 없으면 폴백 크롭. */
  profileFaceBox?: FaceBox | null;
  guildEmblemUrl?: string | null;
  /** AppHeader(server)가 client HeaderDiamond를 주입 — Suspense fallback은 정적 표시. */
  diamondSlot?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 box-content flex h-12 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 pt-[env(safe-area-inset-top)] dark:border-zinc-800 dark:bg-zinc-950">
      {/* 아바타 클릭=아바타 선택(/me/profiles), 이름 클릭=닉네임 변경 팝업. */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
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
              // 박스는 그대로 두고 이미지만 6px 아래로 — 얼굴이 내려와 상단 짤림 완화.
              className="absolute inset-x-0 top-[6px] h-full w-full"
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
        {/* 이름↔문양은 좁게(gap-1), 아바타↔이름은 기존 gap-2 유지. */}
        <span className="flex min-w-0 items-center gap-1">
          <NicknameEditor
            current={nickname}
            changedCount={nicknameChangedCount}
            diamond={String(diamond)}
            className="!text-[13px] text-zinc-800 dark:text-zinc-100"
          />
          <GuildBadge emblemUrl={guildEmblemUrl} size={18} className="shrink-0" />
        </span>
      </div>

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
        nicknameChangedCount={d.nicknameChangedCount}
        diamond={d.diamond}
        profileSouth={d.profileSouth}
        profileFaceBox={d.profileFaceBox}
        guildEmblemUrl={d.guildEmblemUrl}
        diamondSlot={<HeaderDiamond />}
      />
    </>
  );
}
