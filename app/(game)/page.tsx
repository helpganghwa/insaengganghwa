import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { sql } from 'drizzle-orm';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { freeStatusFromClaims } from '@/lib/game/shop/free';
import { kstDateString } from '@/lib/kst';

import { getWorldFeed } from '@/lib/game/world/event';

import { BattlePassBanner } from './BattlePassBanner';
import { DailySupplyCard } from './DailySupplyCard';
import { HomeBannerCarousel } from './HomeBannerCarousel';
import { HubCheckinCard } from './HubCheckinCard';
import { RankingTop3Card } from './RankingTop3Card';
import { WorldTicker } from './WorldTicker';

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
    label: '세계지도',
    desc: '지역 점령전',
    bg: '/sprites/guild/worldmap.png', // 실제 점령 지도 재활용(카드=실제 맵 일치)
    tint: '#1a2330',
    scale: 1.5, // 정사각 지도를 가로 카드에 꽉 차게 — 좌우 바다 여백 제거(중앙 왕국 확대)
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
    desc: '매일 9시 개시', // 실제 문구는 meleeDesc(배틀 상태)로 동적 대체

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

/** 지역색 — 월드맵 노드와 일치(WorldMapView REGION). 거주지 카드 강조용. */
const REGION_COLOR: Record<string, string> = {
  volcano: '#ef4444',
  temple: '#60a5fa',
  swamp: '#22c55e',
  orc: '#f97316',
  kingdom: '#fbbf24',
  angel: '#c084fc',
};

export default async function HomePage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
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
  //  발표 전: 진행 전("오늘 9시 개시") / 진행 중 / 집계 중. 발표 후: 우승자 닉네임.
  //  시각 판정은 서버 시계(SQL now())로(CLAUDE §3.2) — 아래 melee 조회에서 phase 산출.
  let meleeDesc = '매일 9시 개시';
  /** 발표 후 우승자 닉네임(있으면 카드에서 색상 강조 렌더). */
  let meleeChampion: string | null = null;
  /** 발표 후 회차(제N회 우승). */
  let meleeEdition = 0;
  /** 월드맵 카드 — 현재 거주 구역명(지역색 강조). 미배정/미소속이면 null. */
  let residenceName: string | null = null;
  let residenceRegion: string | null = null;
  // 세계지도 카드 설명 — 점령전(매일 23:00~24:00 KST) 시간 상태. 기본값=비점령 문구.
  let conquestStatus = '오늘 23시 점령전';

  if (userId) {
    const kstToday = kstDateString();
    // 홈 카드/배지 전체를 **단일 SQL 1왕복**으로 — 일일보급·출석·강화/보급/우편/레이드
    // 배지·대난투 phase·거주지·상점 무료 클레임을 스칼라 서브쿼리로 한 행에 모음.
    // (이전: Promise.all 9쿼리 → 커넥션 9개 동시 요구로 콜드/포화 시 타임아웃 빈발.
    //  이제 핸드셰이크 1회·~30ms. 콜드/hang 시 가드로 무한대기 방지, CLAUDE §11.4.)
    try {
      const [row] = (await withTimeout(
        db.execute(sql`
          select
            (select count(*)::int from mailbox
               where user_id = ${userId}::uuid and server_id = ${serverId} and sender_label = '일일 보급' and claimed_at is null
                 and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date)
              as daily_unclaimed,
            (select last_claimed_kst_day::text from user_checkin_state where user_id = ${userId}::uuid and server_id = ${serverId})
              as checkin_last,
            (select count(*)::int from enhancement_jobs
               where user_id = ${userId}::uuid and server_id = ${serverId} and status = 'running' and complete_at <= now())
              as enhance_ready,
            (select coalesce(sum(count),0)::int from user_supply_boxes where user_id = ${userId}::uuid and server_id = ${serverId})
              as supply_sum,
            (select count(*)::int from mailbox
               where user_id = ${userId}::uuid and server_id = ${serverId} and claimed_at is null
                 and (expires_at is null or expires_at > now()))
              as mail_unclaimed,
            (select count(*)::int from raid_rewards rr join raids r on r.id = rr.raid_id where rr.user_id = ${userId}::uuid and r.server_id = ${serverId} and rr.claimed_at is null)
              as raid_unclaimed,
            -- 대난투: 서버 시계로 phase(개시 전/진행/발표 후) + 오늘 배틀 상태·우승자 닉.
            case
              when n.kst::time < time '09:00' then 'before'
              when n.kst::time < time '09:30' then 'running'
              else 'after'
            end as melee_phase,
            b.status::text as melee_status,
            -- 우승자 닉네임은 그 회차 스냅샷(finale.roster rank 1) 우선 — 현재 닉 변경과 무관. 없으면 현재닉 폴백.
            coalesce(
              (select elem->>'nickname'
                 from jsonb_array_elements(
                   case when jsonb_typeof(b.finale->'roster') = 'array' then b.finale->'roster' else '[]'::jsonb end
                 ) elem
                 where (elem->>'rank')::int = 1
                 limit 1),
              cc.nickname
            ) as melee_champ,
            (select count(*)::int from melee_battles where server_id = ${serverId} and battle_date <= n.kst::date) as melee_edition,
            rz.name as residence_name,
            rz.region::text as residence_region,
            extract(hour from n.kst)::int as kst_hour,
            -- 상점 무료 클레임 — 주기 비교는 JS(freeStatusFromClaims, 단일 진실).
            coalesce(
              (select json_agg(json_build_array(slot, period_key)) from shop_free_claims where user_id = ${userId}::uuid and server_id = ${serverId}),
              '[]'::json
            ) as free_claims
          from (select (now() at time zone 'Asia/Seoul') kst) n
          left join melee_battles b on b.battle_date = n.kst::date and b.server_id = ${serverId}
          left join characters cc on cc.user_id = b.champion_user_id and cc.server_id = ${serverId}
          left join characters me on me.user_id = ${userId}::uuid and me.server_id = ${serverId}
          left join zones rz on rz.id = me.residence_zone_id
          limit 1
        `),
        3000,
        'home.cards',
      )) as unknown as Array<{
        daily_unclaimed: number;
        checkin_last: string | null;
        enhance_ready: number;
        supply_sum: number;
        mail_unclaimed: number;
        raid_unclaimed: number;
        melee_phase: 'before' | 'running' | 'after';
        melee_status: string | null;
        melee_champ: string | null;
        melee_edition: number;
        residence_name: string | null;
        residence_region: string | null;
        kst_hour: number;
        free_claims: [string, string][];
      }>;

      if (row) {
        hasUnclaimedDaily = (row.daily_unclaimed ?? 0) > 0;
        hasUnclaimedCheckin = (row.checkin_last ?? null) !== kstToday;
        counts['/enhance'] = row.enhance_ready ?? 0;
        counts['/gacha'] = row.supply_sum ?? 0;
        counts['/mail'] = row.mail_unclaimed ?? 0;
        counts['/raid'] = row.raid_unclaimed ?? 0;
        counts['/shop'] = Object.values(
          freeStatusFromClaims(
            (row.free_claims ?? []).map(([slot, periodKey]) => ({ slot, periodKey })),
          ),
        ).filter(Boolean).length;
        residenceName = row.residence_name ?? null;
        residenceRegion = row.residence_region ?? null;
        // 23시대(23:00~24:00) = 점령전 진행중, 그 외 = 오늘 밤 일정 안내.
        conquestStatus = row.kst_hour === 23 ? '점령전 진행중' : '오늘 23시 점령전';
        // phase별 문구. 발표 후(after) + revealed면 우승자, 닉 미상(더미)이면 발표 문구.
        if (row.melee_phase === 'before') meleeDesc = '오늘 9시 개시';
        else if (row.melee_phase === 'running') meleeDesc = '난투 진행 중';
        else if (row.melee_status === 'revealed') {
          if (row.melee_champ) {
            meleeChampion = row.melee_champ;
            meleeEdition = row.melee_edition ?? 0;
          } else meleeDesc = '오늘의 결과 발표';
        } else meleeDesc = '결과 집계 중';
      }
    } catch {
      // 콜드/hang → 카드 + 알림 숨김(기본 false/0). 메뉴 그리드는 정상 노출.
    }
  }

  // 월드 소식 티커 — 헤더 하단 고정, 최근 10건 롤링(클릭 시 /world 전체). 콜드/hang 시 빈 배열로 degrade.
  const worldFeed = userId
    ? await withTimeout(getWorldFeed(serverId, 10), 2500, 'home.worldfeed').catch(() => [])
    : [];

  return (
    <>
      {worldFeed.length > 0 && <WorldTicker entries={worldFeed} />}
      <div className="flex flex-col gap-3 px-4 py-4">
      <RankingTop3Card />
      <HomeBannerCarousel>
        {hasUnclaimedDaily ? <DailySupplyCard /> : null}
        {hasUnclaimedCheckin ? <HubCheckinCard /> : null}
        {/* 성장패스 상시 배너 — 캐러셀 마지막 슬라이드 */}
        <BattlePassBanner />
      </HomeBannerCarousel>
      <div className="grid grid-cols-2 gap-2.5">
        {MENU.map((m) => {
          const count = counts[m.href] ?? 0;
          const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;
          const isMeleeChamp = m.href === '/melee' && meleeChampion;
          const isWorldmapCard = m.href === '/guild/map';
          const desc = m.href === '/melee' ? meleeDesc : m.desc;
          return (
            <Link
              key={m.href}
              href={m.href}
              data-tut={m.href === '/gacha' ? 'goto-gacha' : undefined}
              style={{ backgroundColor: m.tint }}
              className="relative flex aspect-[50/17] isolate overflow-hidden rounded-2xl border border-zinc-800 transition active:scale-[0.98]"
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
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-5 pb-1.5">
                <div className="flex items-baseline gap-1.5">
                  <div className="shrink-0 text-sm leading-tight font-bold text-white drop-shadow-sm">
                    {m.label}
                  </div>
                  {/* 세계지도 카드 — 내 거주 구역명을 제목 바로 오른쪽에(라벨 없이, 설명과 같은 10px). */}
                  {isWorldmapCard && residenceName ? (
                    <span
                      className="min-w-0 truncate text-[10px] font-extrabold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                      style={{ color: REGION_COLOR[residenceRegion ?? ''] ?? '#fcd34d' }}
                    >
                      {residenceName}
                    </span>
                  ) : null}
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
                  ) : isWorldmapCard ? (
                    conquestStatus
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
    </>
  );
}
