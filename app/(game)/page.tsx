import { Fragment } from 'react';
import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { sql } from 'drizzle-orm';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId, shouldHidePaidContent } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { freeStatusFromClaims } from '@/lib/game/shop/free';
import { kstDateString } from '@/lib/kst';

import { getWorldFeed } from '@/lib/game/world/event';
import { listPublishedAnnouncements } from '@/lib/game/announcement';
import { getTutorialState } from '@/lib/game/tutorial';
import { getChallengeStatus } from '@/lib/game/challenges/status';
import { getTodayTicker } from '@/lib/game/today/stats';
import { TodayTicker } from './TodayTicker';
import { activeChallenges, COMPLETE_BONUS } from '@/lib/game/challenges/defs';
import { RAID_MAX_PARTICIPANTS } from '@/lib/game/balance';

import { AnnouncementBoard } from './AnnouncementBoard';
import { ConquestCardStatus } from './ConquestCardStatus';
import { BattlePassBanner } from './BattlePassBanner';
import { DailySupplyCard } from './DailySupplyCard';
import { HomeBannerCarousel } from './HomeBannerCarousel';
import { CheckinPopupGate } from './CheckinPopup';
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
    href: '/gacha',
    label: '보급',
    desc: '랜덤 장비 획득',
    bg: '/sprites/hub/gacha.png',
    tint: '#143a2a',
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
  {
    href: '/mail',
    label: '우편함',
    desc: '받은 보상 확인',
    bg: '/sprites/hub/mail.png',
    tint: '#2a1f0c',
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
  // CBT 기간엔 일반 유저에게 성장패스(결제 콘텐츠) 배너를 숨김. 테스터·정식 출시 시 노출.
  const hidePaid = await shouldHidePaidContent();
  // (game) layout이 가드하므로 정상 흐름엔 null 아님. 폴백 안전.
  let hasUnclaimedDaily = false;
  let hasUnclaimedCheckin = false;
  let checkinDayProgress = 0;
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
  let raidJoinable = 0;
  /** 발표 후 우승자 닉네임(있으면 카드에서 색상 강조 렌더). */
  let meleeChampion: string | null = null;
  /** 발표 후 회차(제N회 우승). */
  let meleeEdition = 0;
  /** 월드맵 카드 — 현재 거주 구역명(지역색 강조). 미배정/미소속이면 null. */
  let residenceName: string | null = null;
  let residenceRegion: string | null = null;
  // 세계지도 카드 — 점령전(매일 KST 23:00 = UTC 14:00, 한국 DST 없음). 진행중(23시대) 여부 +
  // 다음 23:00까지 카운트다운(targetMs=다음 23:00의 UTC epoch). 진행중 여부는 로그인 시 DB 시계로 갱신.
  let conquestInProgress = new Date().getUTCHours() === 14; // 로그아웃/콜드 폴백(KST 23시대)
  /** 최신 공개 연대기 날짜 — 미열람이면 카운트다운 대신 '새 역사' 티저(열람 판정은 클라 localStorage). */
  let latestChronicleDay: string | null = null;
  /** 그날 헤드라인(마커 제거 평문) — 있으면 티저 문구로 사용, 없으면 '새로운 역사가 쓰였다'. */
  let chronicleHeadline: string | null = null;
  const conquestTargetMs = (() => {
    const n = new Date();
    const t = new Date(n);
    t.setUTCHours(14, 0, 0, 0); // KST 23:00
    if (t.getTime() <= n.getTime()) t.setUTCDate(t.getUTCDate() + 1);
    return t.getTime();
  })();

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
            (select day_progress from user_checkin_state where user_id = ${userId}::uuid and server_id = ${serverId})
              as checkin_dp,
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
            -- 참여 가능 레이드(2026-07-16 고객 문의) — 남이 연 active 레이드 중 미참여, 일일 한도(5) 여유 시만.
            (select case when coalesce((select started_count from raid_daily_counts
                     where user_id = ${userId}::uuid and server_id = ${serverId}
                       and kst_date = (now() at time zone 'Asia/Seoul')::date), 0) >= 5 then 0
              else (select count(*)::int from raids r
                     where r.server_id = ${serverId} and r.status = 'active' and r.expire_at > now()
                       and r.host_user_id <> ${userId}::uuid
                       and not exists (select 1 from raid_participants rp
                                        where rp.raid_id = r.id and rp.user_id = ${userId}::uuid)
                       -- 정원 여유(호스트 포함 상한) — 만석 레이드는 참여 불가(2026-07-16 오표기 수정)
                       and (select count(*)::int from raid_participants rp3 where rp3.raid_id = r.id) < ${RAID_MAX_PARTICIPANTS}
                       -- 가시성 — 내가 발견 가능한 레이드만: 친구 공개(호스트와 친구) 또는 길드 공개(같은 길드)
                       and (
                         (r.friend_share <> 'off' and exists (
                            select 1 from friend_links fl
                            where fl.server_id = r.server_id and fl.status = 'accepted'
                              and ((fl.requester_id = r.host_user_id and fl.addressee_id = ${userId}::uuid)
                                or (fl.addressee_id = r.host_user_id and fl.requester_id = ${userId}::uuid))))
                         or
                         (r.guild_share <> 'off' and exists (
                            select 1 from guild_members gm1
                            join guild_members gm2 on gm2.guild_id = gm1.guild_id and gm2.server_id = gm1.server_id
                            where gm1.user_id = r.host_user_id and gm2.user_id = ${userId}::uuid
                              and gm1.server_id = r.server_id))
                       )) end)
              as raid_joinable,
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
            ) as free_claims,
            -- 최신 공개 연대기(kst_day < 오늘 = 자정 공개분) — '새 역사' 티저 판정용(읽음은 클라 localStorage).
            (select max(kst_day)::text from world_chronicle where server_id = ${serverId} and kst_day < n.kst::date)
              as chron_day,
            (select headline from world_chronicle where server_id = ${serverId} and kst_day < n.kst::date
              order by kst_day desc limit 1)
              as chron_headline
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
        checkin_dp: number | null;
        enhance_ready: number;
        supply_sum: number;
        mail_unclaimed: number;
        raid_unclaimed: number;
        raid_joinable: number;
        melee_phase: 'before' | 'running' | 'after';
        melee_status: string | null;
        melee_champ: string | null;
        melee_edition: number;
        residence_name: string | null;
        residence_region: string | null;
        kst_hour: number;
        free_claims: [string, string][];
        chron_day: string | null;
        chron_headline: string | null;
      }>;

      if (row) {
        hasUnclaimedDaily = (row.daily_unclaimed ?? 0) > 0;
        hasUnclaimedCheckin = (row.checkin_last ?? null) !== kstToday;
        checkinDayProgress = row.checkin_dp ?? 0;
        counts['/enhance'] = row.enhance_ready ?? 0;
        counts['/gacha'] = row.supply_sum ?? 0;
        counts['/mail'] = row.mail_unclaimed ?? 0;
        counts['/raid'] = row.raid_unclaimed ?? 0;
        raidJoinable = row.raid_joinable ?? 0;
        // CBT 일반 유저는 상점 전체가 '준비 중'(ShopClosed) — 무료 수령 뱃지가 상시 3으로 떠서
        // 들어가면 닫혀 있는 오표시 방지(2026-07-13). 심사/어드민·정식 출시에는 정상 계산.
        counts['/shop'] = (await shouldHidePaidContent())
          ? 0
          : Object.values(
              freeStatusFromClaims(
                (row.free_claims ?? []).map(([slot, periodKey]) => ({ slot, periodKey })),
              ),
            ).filter(Boolean).length;
        residenceName = row.residence_name ?? null;
        residenceRegion = row.residence_region ?? null;
        // 23시대(23:00~24:00) = 점령전 진행중(DB 시계 권위).
        conquestInProgress = row.kst_hour === 23;
        latestChronicleDay = row.chron_day ?? null;
        // 헤드라인 마커({g|이름}·{z|이름}·{u|닉|코드}) → 평문. 카드 desc의 truncate가 말줄임 처리.
        chronicleHeadline =
          row.chron_headline?.replace(/\{[gzu]\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').trim() || null;
        // phase별 문구. 발표 후(after) + revealed면 우승자, 닉 미상(더미)이면 발표 문구.
        if (row.melee_phase === 'before') meleeDesc = '오늘 9시 개시';
        else if (row.melee_phase === 'running') meleeDesc = '난투 진행 중';
        else if (row.melee_status === 'revealed') {
          if (row.melee_champ) {
            meleeChampion = row.melee_champ;
            meleeEdition = row.melee_edition ?? 0;
          } else meleeDesc = '오늘의 결과 발표';
        } else if (row.melee_status == null) {
          // 오늘 배틀 행 자체가 없음 — 9시 이후 오픈한 서버·참가자 0명인 날(run 조기 반환).
          // 집계할 것이 없는데 '집계 중'이 자정까지 뜨던 문제(2026-07-13) → 다음 회차 안내로.
          meleeDesc = '내일 9시 개시';
        } else meleeDesc = '결과 집계 중'; // 행 있고 미공개 — 실제 집계 창(09:30~10:00)
      }
    } catch {
      // 콜드/hang → 카드 + 알림 숨김(기본 false/0). 메뉴 그리드는 정상 노출.
    }
  }

  // 월드 소식 티커 — 헤더 하단 고정, 최근 10건 롤링(클릭 시 /world 전체). 콜드/hang 시 빈 배열로 degrade.
  // 월드피드 + 게시판(공지) 병렬 조회(독립 — §11.4 왕복 최소화). 콜드/hang 시 각각 빈 배열로 degrade.
  const [worldFeed, announcements, tutState, chgStatus, todayStats] = userId
    ? await Promise.all([
        withTimeout(getWorldFeed(serverId, 10), 2500, 'home.worldfeed').catch(() => []),
        withTimeout(listPublishedAnnouncements(30), 2000, 'home.ann').catch(() => []),
        // 튜토리얼 미완료 유저에겐 공지 강제 팝업을 억제(온보딩 우선) — 신규 유저가 공지에 가려
        // 튜토리얼을 못 보던 문제(2026-07-13 CBT 피드백). 실패 시 done으로 폴백(팝업 정상 노출).
        withTimeout(getTutorialState(userId, serverId), 1500, 'home.tut').catch(
          () => ({ phase: 'done' as const, step: null }),
        ),
        // 도전 과제 진행/수령가능 — 홈 전용 카드용(실패 시 null → 카드 기본 표시).
        withTimeout(getChallengeStatus(userId, serverId, hidePaid), 2000, 'home.chg').catch(
          () => null,
        ),
        // 오늘의 인생강화 티커(0120) — 실패 시 null(티커 미노출).
        withTimeout(getTodayTicker(userId, serverId), 2000, 'home.today').catch(() => null),
      ])
    : [[], [], { phase: 'done' as const, step: null }, null, null];
  const tutorialActive = tutState.phase !== 'done';

  return (
    <>
      {/* 출석 자동 팝업(2026-07-22, /checkin 대체) — 튜토리얼 중엔 억제(코치마크 우선). */}
      {userId && !tutorialActive ? (
        <CheckinPopupGate unclaimed={hasUnclaimedCheckin} dayProgress={checkinDayProgress} />
      ) : null}
      {worldFeed.length > 0 && <WorldTicker entries={worldFeed} />}
      <div className="flex flex-col gap-3 px-4 py-4">
      <RankingTop3Card />
      {/* 오늘의 인생강화 티커(0120) — 랭킹 바로 아래 1줄, /today 진입점(2026-07-16 확정).
          신규(장비 0·활동 0)에겐 숨김 — '전투력 0' 노출 방지. */}
      {todayStats && (todayStats.combat > 0 || todayStats.attempts > 0) ? (
        <TodayTicker data={todayStats} />
      ) : null}
      {/* 도전 과제 배너 — 일회성 온보딩 리워드(0118). 캐러셀 배너와 동일 규격(h-16),
          랭킹 바로 아래(2026-07-15 위치·크기 확정). 수령 가능 시 앰버 글로우. */}
      {(() => {
        const actives = activeChallenges(hidePaid);
        const total = actives.length;
        const totalDiamond = actives.reduce((a, c) => a + c.diamond, 0) + COMPLETE_BONUS.diamond;
        const claimedN = chgStatus ? actives.filter((c) => chgStatus.claimed.has(c.id)).length : 0;
        const claimable = chgStatus?.claimable ?? 0;
        const allDone = chgStatus?.completeClaimed ?? false;
        if (allDone) return null; // 전부 정복(보너스까지 수령) — 배너 은퇴
        return (
          <Link prefetch={false}
            href="/challenges"
            className={`relative isolate block h-16 w-full min-w-0 overflow-hidden rounded-xl border transition active:scale-[0.99] ${
              claimable > 0
                ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                : 'border-amber-600/40'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl('/sprites/hub/challenges.png')}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
            <div className="relative z-10 flex h-full w-full items-center px-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wider text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  도전 과제
                </div>
                <div className="truncate text-[12px] font-medium text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  모든 콘텐츠 정복하고 💎{totalDiamond.toLocaleString('ko-KR')} 받기
                </div>
              </div>
              {claimable > 0 ? (
                <span className="shrink-0 animate-pulse rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">
                  받을 보상 {claimable}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white/90">
                  {claimedN}/{total}
                </span>
              )}
            </div>
          </Link>
        );
      })()}
      <HomeBannerCarousel>
        {hasUnclaimedDaily ? <DailySupplyCard /> : null}
        {/* 성장패스 상시 배너 — 캐러셀 마지막 슬라이드. CBT엔 일반 유저에게 숨김. */}
        {hidePaid ? null : <BattlePassBanner />}
      </HomeBannerCarousel>
      <div className="grid grid-cols-2 gap-2.5">
        {MENU.map((m, i) => {
          const count = counts[m.href] ?? 0;
          const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;
          const isMeleeChamp = m.href === '/melee' && meleeChampion;
          const isWorldmapCard = m.href === '/guild/map';
          const desc =
            m.href === '/melee'
              ? meleeDesc
              : m.href === '/raid' && raidJoinable > 0
                ? `참여 가능 레이드 ${raidJoinable}`
                : m.desc;
          const descHot = m.href === '/raid' && raidJoinable > 0; // 참여 가능 — desc 강조색
          return (
            <Fragment key={m.href}>
              {/* 게시판 카드 — 상점 뒤·우편함 앞(index 6). */}
              {i === 6 && (
                <AnnouncementBoard items={announcements} tint="#2b2147" holdPopup={tutorialActive} />
              )}
              <Link prefetch={false}
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
                    <ConquestCardStatus
                      inProgress={conquestInProgress}
                      targetMs={conquestTargetMs}
                      serverId={serverId}
                      chronicleDay={latestChronicleDay}
                      chronicleHeadline={chronicleHeadline}
                    />
                  ) : descHot ? (
                    <span className="font-extrabold text-emerald-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{desc}</span>
                  ) : (
                    desc
                  )}
                </div>
              </div>
              </Link>
            </Fragment>
          );
        })}
      </div>

      </div>
    </>
  );
}
