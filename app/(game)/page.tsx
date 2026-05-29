import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { mailbox } from '@/lib/db/schema/mailbox';
import { userCheckinState } from '@/lib/db/schema/checkin';
import { kstDateString } from '@/lib/kst';

import { DailySupplyCard } from './DailySupplyCard';
import { HubCheckinCard } from './HubCheckinCard';
import { RankingTop3Card } from './RankingTop3Card';

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
// 메뉴 4카드 — SCREEN-ANALYSIS §6 P0-4(2026-05-25). 코어 4 동선만 그리드 노출.
// 빠진 4개 진입점:
//  - 우편함 → 헤더 📬 / 도감 → 프로필 / 프로필 → 바텀네비 👤 / 랭킹 → 홈 랭킹 카드 "전체 →"
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
] as const;

export default async function HomePage() {
  const userId = await getSessionUserId();
  // (game) layout이 가드하므로 정상 흐름엔 null 아님. 폴백 안전.
  let hasUnclaimedDaily = false;
  let hasUnclaimedCheckin = false;
  if (userId) {
    const kstToday = kstDateString();
    // 일일 보급 + 출석 state — 핫패스 1RTT(병렬, CLAUDE §11.4).
    // 콜드 DB 커넥션 hang 시 페이지가 무한 대기하지 않도록 가드 — 실패 시 카드 숨김(2026-05-29).
    try {
      const [dailyRow, checkinRow] = await withTimeout(
        Promise.all([
          db
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
            .limit(1) as unknown as Promise<Array<{ n: number }>>,
          db
            .select({ lastClaimedKstDay: userCheckinState.lastClaimedKstDay })
            .from(userCheckinState)
            .where(eq(userCheckinState.userId, userId))
            .limit(1),
        ]),
        3000,
        'home.cards',
      );
      hasUnclaimedDaily = (dailyRow[0]?.n ?? 0) > 0;
      // 신규 유저 = 행 없음 → lastClaimed=null → 카드 노출(D1).
      const last = checkinRow[0]?.lastClaimedKstDay ?? null;
      hasUnclaimedCheckin = last !== kstToday;
    } catch {
      // 콜드/hang → 보급·출석 카드 숨김(기본 false). 메뉴 그리드는 정상 노출.
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {hasUnclaimedDaily ? <DailySupplyCard /> : null}
      {hasUnclaimedCheckin ? <HubCheckinCard /> : null}
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
      <RankingTop3Card />
    </div>
  );
}
