import Link from 'next/link';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { mailbox } from '@/lib/db/schema/mailbox';
import { raidRewards } from '@/lib/db/schema/raid';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { userCheckinState } from '@/lib/db/schema/checkin';
import { getFreeStatus } from '@/lib/game/shop/free';
import { kstDateString } from '@/lib/kst';

import { BattlePassBanner } from './BattlePassBanner';
import { DailySupplyCard } from './DailySupplyCard';
import { HomeBannerCarousel } from './HomeBannerCarousel';
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
// 메뉴 8카드 — 월드맵/길드(최상단) + 대난투/레이드/강화/보급/우편함/상점. 인벤토리는 바텀네비로 이동.
const MENU = [
  {
    href: '/guild/map',
    label: '월드맵',
    desc: '지역 점령전',
    bg: '/sprites/guild/worldmap.png', // 실제 점령 지도 재활용(카드=실제 맵 일치)
    tint: '#1a2330',
    scale: 1,
  },
  {
    href: '/guild',
    label: '길드',
    desc: '함께 성장·점령',
    bg: '/sprites/hub/guild.png',
    tint: '#2a2012',
    scale: 1,
  },
  {
    href: '/melee',
    label: '대난투',
    desc: '매일 오전 9시 개시', // 실제 문구는 meleeDesc(배틀 상태)로 동적 대체

    bg: '/sprites/hub/melee.png',
    tint: '#3a2e16',
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
    href: '/enhance',
    label: '강화',
    desc: '장비를 한계까지 단련',
    bg: '/sprites/hub/enhance.png',
    tint: '#3d1f0c',
    scale: 1.3,
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
    href: '/mail',
    label: '우편함',
    desc: '받은 보상 확인',
    bg: '/sprites/hub/mail.png',
    tint: '#2a1f0c',
    scale: 1,
  },
  {
    href: '/shop',
    label: '상점',
    desc: '다이아·보급상자 구매',
    bg: '/sprites/hub/shop.png',
    tint: '#1c2238',
    scale: 1,
  },
] as const;

export default async function HomePage() {
  const userId = await getSessionUserId();
  // (game) layout이 가드하므로 정상 흐름엔 null 아님. 폴백 안전.
  let hasUnclaimedDaily = false;
  let hasUnclaimedCheckin = false;
  /** 메뉴 카드 우상단 알림 뱃지. 0이면 미노출. */
  const counts: Record<string, number> = {
    '/enhance': 0,
    '/gacha': 0,
    '/mail': 0,
    '/raid': 0,
    '/shop': 0,
  };

  // 대난투 카드 상태 문구 — KST 09:00 개시 / 09:30 발표(MELEE §3).
  //  발표 전: 진행 전("오늘 오전 9시 개시") / 진행 중 / 집계 중. 발표 후: 우승자 닉네임.
  //  시각 판정은 서버 시계(SQL now())로(CLAUDE §3.2) — 아래 melee 조회에서 phase 산출.
  let meleeDesc = '매일 오전 9시 개시';
  /** 발표 후 우승자 닉네임(있으면 카드에서 색상 강조 렌더). */
  let meleeChampion: string | null = null;
  /** 발표 후 회차(제N회 우승). */
  let meleeEdition = 0;

  if (userId) {
    const kstToday = kstDateString();
    // 일일 보급 + 출석 state + 4종 알림 카운트 — 핫패스 1RTT(병렬, CLAUDE §11.4).
    // 콜드 DB 커넥션 hang 시 페이지가 무한 대기하지 않도록 가드.
    try {
      const [dailyRow, checkinRow, enhanceRow, supplyRow, mailRow, raidRow, meleeRow, freeStatus] =
        await withTimeout(
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
          // 강화: complete_at 도달한 running job 수.
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(enhancementJobs)
            .where(
              and(
                eq(enhancementJobs.userId, userId),
                eq(enhancementJobs.status, 'running'),
                lte(enhancementJobs.completeAt, sql`now()`),
              ),
            ) as unknown as Promise<Array<{ n: number }>>,
          // 보급: 슬롯 3종 보급상자 총합.
          db
            .select({ n: sql<number>`coalesce(sum(${userSupplyBoxes.count}),0)::int` })
            .from(userSupplyBoxes)
            .where(eq(userSupplyBoxes.userId, userId)) as unknown as Promise<Array<{ n: number }>>,
          // 우편함: 미수령(미만료) 메일 수.
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(mailbox)
            .where(
              and(
                eq(mailbox.userId, userId),
                isNull(mailbox.claimedAt),
                or(isNull(mailbox.expiresAt), gt(mailbox.expiresAt, sql`now()`)),
              ),
            ) as unknown as Promise<Array<{ n: number }>>,
          // 레이드: 미수령 보상 수.
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(raidRewards)
            .where(
              and(eq(raidRewards.userId, userId), isNull(raidRewards.claimedAt)),
            ) as unknown as Promise<Array<{ n: number }>>,
          // 대난투: 서버 시계로 phase(개시 전/진행/발표 후) + 오늘 배틀 상태·우승자 닉.
          // now() 서브쿼리 기준이라 오늘 배틀이 없어도(09:00 전) 항상 1행 반환.
          db.execute(sql`
            select
              case
                when n.kst::time < time '09:00' then 'before'
                when n.kst::time < time '09:30' then 'running'
                else 'after'
              end as phase,
              b.status::text status,
              p.nickname champ_nick,
              (select count(*)::int from melee_battles where battle_date <= n.kst::date) edition
            from (select (now() at time zone 'Asia/Seoul') kst) n
            left join melee_battles b on b.battle_date = n.kst::date
            left join profiles p on p.id = b.champion_user_id
            limit 1
          `) as unknown as Promise<
            Array<{
              phase: 'before' | 'running' | 'after';
              status: string | null;
              champ_nick: string | null;
              edition: number;
            }>
          >,
          // 상점 무료 수령 가능 슬롯(빨간 배지 = 받을 수 있는 무료 수).
          getFreeStatus(userId),
          ]),
          3000,
          'home.cards',
        );
      hasUnclaimedDaily = (dailyRow[0]?.n ?? 0) > 0;
      const last = checkinRow[0]?.lastClaimedKstDay ?? null;
      hasUnclaimedCheckin = last !== kstToday;
      counts['/enhance'] = enhanceRow[0]?.n ?? 0;
      counts['/gacha'] = supplyRow[0]?.n ?? 0;
      counts['/mail'] = mailRow[0]?.n ?? 0;
      counts['/raid'] = raidRow[0]?.n ?? 0;
      counts['/shop'] = Object.values(freeStatus).filter(Boolean).length;
      // phase별 문구. 발표 후(after) + revealed면 우승자, 닉 미상(더미)이면 발표 문구.
      const melee = meleeRow[0];
      if (melee) {
        if (melee.phase === 'before') meleeDesc = '오늘 오전 9시 개시';
        else if (melee.phase === 'running') meleeDesc = '난투 진행 중';
        else if (melee.status === 'revealed') {
          if (melee.champ_nick) {
            meleeChampion = melee.champ_nick;
            meleeEdition = melee.edition ?? 0;
          } else meleeDesc = '오늘의 결과 발표';
        } else meleeDesc = '결과 집계 중';
      }
    } catch {
      // 콜드/hang → 카드 + 알림 숨김(기본 false/0). 메뉴 그리드는 정상 노출.
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <RankingTop3Card />
      <HomeBannerCarousel>
        {hasUnclaimedDaily ? <DailySupplyCard /> : null}
        {hasUnclaimedCheckin ? <HubCheckinCard /> : null}
      </HomeBannerCarousel>
      <BattlePassBanner />
      <div className="grid grid-cols-2 gap-3">
        {MENU.map((m) => {
          const count = counts[m.href] ?? 0;
          const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;
          const isMeleeChamp = m.href === '/melee' && meleeChampion;
          const desc = m.href === '/melee' ? meleeDesc : m.desc;
          return (
            <Link
              key={m.href}
              href={m.href}
              data-tut={m.href === '/gacha' ? 'goto-gacha' : undefined}
              style={{ backgroundColor: m.tint }}
              className="relative flex aspect-[5/3] isolate overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
            >
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
              {badge ? (
                <span
                  aria-label={`알림 ${count}건`}
                  className="absolute top-1.5 right-1.5 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow ring-2 ring-zinc-900/50 tabular-nums"
                >
                  {badge}
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-6 pb-2">
                <div className="text-sm leading-tight font-bold text-white drop-shadow-sm">
                  {m.label}
                </div>
                <div className="mt-0.5 truncate text-[10px] leading-tight text-white/85">
                  {isMeleeChamp ? (
                    <>
                      <span className="text-white/70">
                        {meleeEdition > 0 ? `제${meleeEdition}회 우승 ` : '우승 '}
                      </span>
                      <span className="font-extrabold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {meleeChampion}
                      </span>
                    </>
                  ) : (
                    desc
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
