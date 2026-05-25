import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { mailbox } from '@/lib/db/schema/mailbox';

import { DailySupplyCard } from './DailySupplyCard';
import { WorldHistoryCard } from './WorldHistoryCard';

/**
 * WIREFRAMES §1 — 홈 (메뉴 허브). 오늘의 보급(미수령 시) + 2×N 메뉴 그리드.
 * 각 카드 = Pixellab 픽셀아트 배경(public/sprites/hub/*.png) + 하단 그라데이션
 * 텍스트(이름 + 한 줄 설명). 장비/강화 현황 정보 없음(강화 화면 전용).
 *
 * 일일 보급 노출(SCREEN-ANALYSIS §6 P0-1, 2026-05-25):
 *  - layout이 ensureDailyMail로 매 접속 자동 적재(KST 자정 기준 멱등 PK).
 *  - 본 페이지는 "오늘 KST 발급분 중 미수령 1건 이상"이면 wide 카드 노출.
 *  - 수령 완료(claimed_at) 시 카드 숨김 → 다음 KST 00:00에 재등장.
 */
// 이미지 톤과 어울리는 카드 배경색 — 픽셀아트가 투명 영역 위에 떠 보이지 않도록.
const MENU = [
  {
    href: '/enhance',
    label: '강화',
    desc: '장비를 한계까지 단련',
    bg: '/sprites/hub/enhance.png',
    tint: '#3d1f0c',
    scale: 1.3,
  },
  {
    href: '/inventory',
    label: '인벤토리',
    desc: '보유 장비 관리',
    bg: '/sprites/hub/inventory.png',
    tint: '#3a2a1c',
    scale: 1,
  },
  {
    href: '/gacha',
    label: '보급',
    desc: '랜덤 장비 획득',
    bg: '/sprites/hub/gacha.png',
    tint: '#143a2a',
    scale: 1,
  },
  {
    href: '/raid',
    label: '레이드',
    desc: '보스 도전',
    bg: '/sprites/hub/raid.png',
    tint: '#3a1419',
    scale: 1,
  },
  {
    href: '/mail',
    label: '우편함',
    desc: '보상·메시지 수령',
    bg: '/sprites/hub/mail.png',
    tint: '#3a2406',
    scale: 1,
  },
  {
    href: '/me/codex',
    label: '도감',
    desc: '수집·최고 강화',
    bg: '/sprites/hub/codex.png',
    tint: '#1f1a36',
    scale: 1,
  },
  {
    href: '/me',
    label: '프로필',
    desc: '내 정보·통계',
    bg: '/sprites/hub/profile.png',
    tint: '#1a2438',
    scale: 1,
  },
  {
    href: '/leaderboard',
    label: '랭킹',
    desc: '최강자 순위',
    bg: '/sprites/hub/ranking.png',
    tint: '#3d2a08',
    scale: 1,
  },
] as const;

export default async function HomePage() {
  const userId = await getSessionUserId();
  // (game) layout이 가드하므로 정상 흐름엔 null 아님. 폴백 안전.
  let hasUnclaimedDaily = false;
  if (userId) {
    // 오늘 KST 발급된 일일 보급 우편 중 미수령 1건 이상 — `daily` sender_label 일치.
    // `(created_at AT TIME ZONE 'Asia/Seoul')::date = KST today` 로 오늘분만 필터.
    const r = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mailbox)
      .where(
        and(
          eq(mailbox.userId, userId),
          eq(mailbox.senderLabel, '일일 보급'),
          isNull(mailbox.claimedAt),
          sql`(${mailbox.createdAt} at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date`,
        ),
      )
      .limit(1)) as Array<{ n: number }>;
    hasUnclaimedDaily = (r[0]?.n ?? 0) > 0;
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {hasUnclaimedDaily ? <DailySupplyCard /> : null}
      <div className="grid grid-cols-2 gap-3">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            style={{ backgroundColor: m.tint }}
            className="relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
          >
            {/* 픽셀아트 배경 — next/image 리샘플은 깨지므로 raw img + imageRendering:pixelated (CLAUDE §5.2). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(m.bg)}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                imageRendering: 'pixelated',
                transform: `scale(${m.scale})`,
                transformOrigin: 'center',
              }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-6 pb-2">
              <div className="text-sm leading-tight font-bold text-white drop-shadow-sm">
                {m.label}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-white/85">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
      <WorldHistoryCard />
    </div>
  );
}
