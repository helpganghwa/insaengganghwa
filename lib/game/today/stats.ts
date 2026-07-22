import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meleePointsCaseSql } from '@/lib/game/melee/points';

/**
 * 오늘의 인생강화(0120) — 자정 스냅샷(user_daily_stats) 대비 현재값 증감 + 오늘 활동 통계.
 * 홈 티커는 getTodayTicker(1왕복, §11.4), 상세는 getTodayDetail(병렬 묶음).
 * 스냅샷 부재(자정 이후 가입·크론 유실) 시 delta = null — UI는 현재값만 표시.
 */

export type TodayTicker = {
  combat: number;
  combatDelta: number | null;
  maxEnhance: number;
  maxDelta: number | null;
  sumEnhance: number;
  sumDelta: number | null;
  attempts: number;
  success: number;
  hold: number;
  down: number;
};

const KST_DAY = sql`(now() at time zone 'Asia/Seoul')::date`;
const KST_DAY_START = sql`((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')`;

/** 홈 티커 payload — 단일 SQL 1왕복. */
export async function getTodayTicker(userId: string, serverId: number): Promise<TodayTicker> {
  const [r] = (await db.execute(sql`
    with lr as (
      select metric, value from leaderboard_ranks
      where server_id = ${serverId} and user_id = ${userId}::uuid and metric in ('combat','max','sum')
    ),
    snap as (
      select combat, max_enhance, sum_enhance from user_daily_stats
      where user_id = ${userId}::uuid and server_id = ${serverId} and kst_day = ${KST_DAY}
    ),
    logs as (
      select count(*)::int attempts,
             count(*) filter (where result in ('success','mega'))::int success,
             count(*) filter (where result = 'hold')::int hold,
             count(*) filter (where result = 'down')::int down
      from enhancement_logs
      where user_id = ${userId}::uuid and server_id = ${serverId} and created_at >= ${KST_DAY_START}
    )
    select
      coalesce((select value from lr where metric='combat'), 0)::bigint combat,
      coalesce((select value from lr where metric='max'), 0)::bigint max_enhance,
      coalesce((select value from lr where metric='sum'), 0)::bigint sum_enhance,
      (select combat from snap)::bigint snap_combat,
      (select max_enhance from snap)::bigint snap_max,
      (select sum_enhance from snap)::bigint snap_sum,
      (select attempts from logs) attempts,
      (select success from logs) success,
      (select hold from logs) hold,
      (select down from logs) down
  `)) as unknown as {
    combat: string; max_enhance: string; sum_enhance: string;
    snap_combat: string | null; snap_max: string | null; snap_sum: string | null;
    attempts: number; success: number; hold: number; down: number;
  }[];
  const n = (v: string | null | undefined) => (v == null ? null : Number(v));
  const combat = Number(r?.combat ?? 0);
  const maxEnhance = Number(r?.max_enhance ?? 0);
  const sumEnhance = Number(r?.sum_enhance ?? 0);
  const sc = n(r?.snap_combat), sm = n(r?.snap_max), ss = n(r?.snap_sum);
  return {
    combat,
    combatDelta: sc == null ? null : combat - sc,
    maxEnhance,
    maxDelta: sm == null ? null : maxEnhance - sm,
    sumEnhance,
    sumDelta: ss == null ? null : sumEnhance - ss,
    attempts: r?.attempts ?? 0,
    success: r?.success ?? 0,
    hold: r?.hold ?? 0,
    down: r?.down ?? 0,
  };
}

export type RankPair = { now: number | null; prev: number | null };

export type TodayDetail = TodayTicker & {
  kstDay: string;
  /** 랭킹 변화 3지표(어제 자정 스냅샷 대비). combatRank*는 하위호환 별칭. */
  rankChanges: { combat: RankPair; max: RankPair; sum: RankPair };
  combatRank: number | null;
  combatRankPrev: number | null;
  melee: { myRank: number | null; total: number; prevRank: number | null; top3: { rank: number; nickname: string }[] } | null;
  boxesOpened: number;
  transcendUps: number;
  raidAttacks: number;
  streakDays: number;
};

/** 상세 페이지 — 티커 payload + 랭킹 변동·대난투·수집·스트릭(병렬 1묶음). */
export async function getTodayDetail(userId: string, serverId: number): Promise<TodayDetail> {
  const [ticker, extra] = await Promise.all([
    getTodayTicker(userId, serverId),
    db.execute(sql`
      with today_day as (select (now() at time zone 'Asia/Seoul')::date d),
      rank_now as (
        select metric, rnk from (
          select user_id, metric, row_number() over (partition by metric order by value desc)::int rnk
          from leaderboard_ranks where server_id = ${serverId} and metric in ('combat','max','sum')
        ) t where user_id = ${userId}::uuid
      ),
      rank_prev as (
        select combat_rank, max_rank, sum_rank from user_daily_stats
        where user_id = ${userId}::uuid and server_id = ${serverId} and kst_day = (select d from today_day)
      ),
      battle as (
        select id from melee_battles where server_id = ${serverId}
          and battle_date = (select d from today_day) and status = 'revealed' limit 1  -- 10시 공개 전(computed) 노출 금지
      ),
      battle_prev as (
        select id from melee_battles where server_id = ${serverId}
          and battle_date = (select d from today_day) - 1 limit 1
      ),
      boxes as (
        select count(*)::int n from supply_open_logs
        where user_id = ${userId}::uuid and server_id = ${serverId} and created_at >= ${KST_DAY_START}
      ),
      tups as (
        select coalesce(sum(to_t - from_t), 0)::int n from transcend_logs
        where user_id = ${userId}::uuid and server_id = ${serverId} and created_at >= ${KST_DAY_START}
      ),
      raids_today as (
        -- 참여 횟수 = 일일 한도 카운터(호스팅+참여 합산, 최대 5) — 공격 횟수(레이드당 다회)와 다름
        -- (2026-07-16: 공격 수를 세어 '참여 10회'로 표기되던 버그).
        select coalesce((select started_count from raid_daily_counts
          where user_id = ${userId}::uuid and server_id = ${serverId}
            and kst_date = (now() at time zone 'Asia/Seoul')::date), 0)::int n
      ),
      days as (select distinct kst_day from checkin_claim_logs
        where user_id = ${userId}::uuid and server_id = ${serverId}
        order by kst_day desc limit 60)
      select
        (select rnk from rank_now where metric='combat') rank_combat,
        (select rnk from rank_now where metric='max') rank_max,
        (select rnk from rank_now where metric='sum') rank_sum,
        (select combat_rank from rank_prev) prev_combat,
        (select max_rank from rank_prev) prev_max,
        (select sum_rank from rank_prev) prev_sum,
        (select final_rank from melee_participants where battle_id = (select id from battle) and user_id = ${userId}::uuid) melee_rank,
        (select count(*)::int from melee_participants where battle_id = (select id from battle)) melee_total,
        (select final_rank from melee_participants where battle_id = (select id from battle_prev) and user_id = ${userId}::uuid) melee_prev,
        (select json_agg(json_build_object('rank', mp.final_rank, 'nickname', c.nickname) order by mp.final_rank)
           from melee_participants mp join characters c on c.user_id = mp.user_id and c.server_id = ${serverId}
           where mp.battle_id = (select id from battle) and mp.final_rank <= 3) melee_top3,
        (select n from boxes) boxes_opened,
        (select n from tups) transcend_ups,
        (select n from raids_today) raid_attacks,
        (select coalesce(json_agg(kst_day::text order by kst_day desc), '[]'::json) from days) checkin_days,
        (select d::text from today_day) kst_day
    `),
  ]);
  const e = (extra as unknown as Record<string, unknown>[])[0] ?? {};
  // 연속 접속(출석 기준) — 오늘부터 하루씩 거슬러 연속 카운트(오늘 미출석이면 어제부터).
  const days = ((e.checkin_days ?? []) as string[]).map((d) => d.slice(0, 10));
  const kstDay = String(e.kst_day ?? '');
  let streak = 0;
  if (days.length > 0) {
    const cursor = new Date(`${kstDay}T12:00:00Z`);
    if (days[0] !== kstDay) cursor.setUTCDate(cursor.getUTCDate() - 1); // 오늘 미출석 허용
    for (const d of days) {
      const want = cursor.toISOString().slice(0, 10);
      if (d !== want) break;
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  const meleeTotal = Number(e.melee_total ?? 0);
  const pair = (now: unknown, prev: unknown) => ({
    now: now == null ? null : Number(now),
    prev: prev == null ? null : Number(prev),
  });
  return {
    ...ticker,
    kstDay,
    rankChanges: {
      combat: pair(e.rank_combat, e.prev_combat),
      max: pair(e.rank_max, e.prev_max),
      sum: pair(e.rank_sum, e.prev_sum),
    },
    combatRank: e.rank_combat == null ? null : Number(e.rank_combat),
    combatRankPrev: e.prev_combat == null ? null : Number(e.prev_combat),
    melee:
      meleeTotal > 0
        ? {
            myRank: e.melee_rank == null ? null : Number(e.melee_rank),
            total: meleeTotal,
            prevRank: e.melee_prev == null ? null : Number(e.melee_prev),
            top3: ((e.melee_top3 ?? []) as { rank: number; nickname: string }[]) ?? [],
          }
        : null,
    boxesOpened: Number(e.boxes_opened ?? 0),
    transcendUps: Number(e.transcend_ups ?? 0),
    raidAttacks: Number(e.raid_attacks ?? 0),
    streakDays: streak,
  };
}

export type LifetimeStats = {
  joinedDays: number;
  combat: number;
  maxEnhance: number;
  sumEnhance: number;
  ranks: { combat: number | null; max: number | null; sum: number | null };
  attempts: number;
  success: number;
  hold: number;
  down: number;
  gemReduces: number;
  gemsSpent: number;
  /** 통산 단련 시간(시간 단위) — Σ elapsed_ms(확률이 차오르던 유효 대기시간, 만기 후 방치 제외). */
  totalTrainH: number;
  boxesOpened: number;
  transcendMax: number;
  transcendSum: number;
  itemKinds: number;
  catalogTotal: number;
  meleeJoined: number;
  meleeWins: number;
  meleeBest: number | null;
  /** 대난투 누적 랭킹 포인트(2026-07-22 개편) — 리더보드 'melee'와 동일 산식. */
  meleePoints: number;
  raidSummons: number;
  raidAttacks: number;
  raidRewards: number;
  checkinDays: number;
  friends: number;
  guildName: string | null;
  guildContribution: number;
  challengesClaimed: number;
  avatarsCreated: number;
};

/** 통산(전체) — 대장장이 이력서(2026-07-16 확장: 랭킹 5종·전투·수집·소셜 풀 프로필). */
export async function getLifetimeStats(userId: string, serverId: number): Promise<LifetimeStats> {
  const [r] = (await db.execute(sql`
    with ranks as (
      select metric, rnk from (
        select user_id, metric, row_number() over (partition by metric order by value desc)::int rnk
        from leaderboard_ranks where server_id=${serverId} and metric in ('combat','max','sum')
      ) t where user_id=${userId}::uuid
    ),
    el as (
      select count(*)::int attempts,
             count(*) filter (where result in ('success','mega'))::int success,
             count(*) filter (where result='hold')::int hold,
             count(*) filter (where result='down')::int down,
             coalesce(sum(elapsed_ms),0)::bigint total_elapsed_ms
      from enhancement_logs where user_id=${userId}::uuid and server_id=${serverId}
    ),
    melee as (
      select count(*)::int joined,
             count(*) filter (where mp.final_rank=1)::int wins,
             min(mp.final_rank)::int best,
             coalesce(sum(${sql.raw(meleePointsCaseSql('mp.final_rank', 'pc.n'))}),0)::int points
      from melee_participants mp
      join melee_battles mb on mb.id=mp.battle_id
      join (select battle_id, count(*)::int as n from melee_participants group by battle_id) pc
        on pc.battle_id=mp.battle_id
      where mp.user_id=${userId}::uuid and mb.server_id=${serverId} and mb.status='revealed'
    )
    select
      greatest(1, ((now() at time zone 'Asia/Seoul')::date
        - ((select created_at from characters where user_id=${userId}::uuid and server_id=${serverId}) at time zone 'Asia/Seoul')::date) + 1)::int joined_days,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='combat'),0)::bigint combat,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='max'),0)::bigint max_e,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='sum'),0)::bigint sum_e,
      (select rnk from ranks where metric='combat') rank_combat,
      (select rnk from ranks where metric='max') rank_max,
      (select rnk from ranks where metric='sum') rank_sum,
      (select attempts from el) attempts, (select success from el) success,
      (select hold from el) hold, (select down from el) down,
      -- 총 단련 시간 원천(2026-07-21 버그) — 매핑은 total_elapsed_ms를 읽는데 select에 빠져 항상 0('—')이었다.
      (select total_elapsed_ms from el) total_elapsed_ms,
      (select count(*)::int from gem_time_reductions where user_id=${userId}::uuid and server_id=${serverId}) gem_reduces,
      (select coalesce(sum(gems_spent),0)::bigint from gem_time_reductions where user_id=${userId}::uuid and server_id=${serverId}) gems_spent,
      (select count(*)::int from supply_open_logs where user_id=${userId}::uuid and server_id=${serverId}) boxes,
      (select coalesce(max(transcend_level),0)::int from user_equipment where user_id=${userId}::uuid and server_id=${serverId}) t_max,
      (select coalesce(sum(transcend_level),0)::int from user_equipment where user_id=${userId}::uuid and server_id=${serverId}) t_sum,
      (select count(*)::int from user_equipment where user_id=${userId}::uuid and server_id=${serverId}) item_kinds,
      (select count(*)::int from catalog_items) catalog_total,
      (select joined from melee) melee_joined, (select wins from melee) melee_wins, (select best from melee) melee_best,
      (select points from melee) melee_points,
      (select count(*)::int from raids where host_user_id=${userId}::uuid and server_id=${serverId}) raid_summons,
      (select count(*)::int from raid_attacks ra join raids rd on rd.id=ra.raid_id where ra.user_id=${userId}::uuid and rd.server_id=${serverId}) raid_attacks,
      (select coalesce(sum(coalesce((rr.boxes->>'weapon')::int,0) + coalesce((rr.boxes->>'armor')::int,0) + coalesce((rr.boxes->>'accessory')::int,0)),0)::int
         from raid_rewards rr join raids rd on rd.id=rr.raid_id
         where rr.user_id=${userId}::uuid and rd.server_id=${serverId} and rr.claimed_at is not null) raid_rewards,
      (select count(*)::int from checkin_claim_logs where user_id=${userId}::uuid and server_id=${serverId}) checkin_days,
      (select count(*)::int from friend_links where server_id=${serverId} and status='accepted' and (requester_id=${userId}::uuid or addressee_id=${userId}::uuid)) friends,
      (select g.name from guild_members gm join guilds g on g.id=gm.guild_id where gm.user_id=${userId}::uuid and gm.server_id=${serverId} limit 1) guild_name,
      coalesce((select gm.contribution_points from guild_members gm where gm.user_id=${userId}::uuid and gm.server_id=${serverId} limit 1),0)::bigint guild_contrib,
      (select count(*)::int from challenge_claims where user_id=${userId}::uuid and server_id=${serverId} and challenge_id <> 'complete') chg_claimed,
      (select count(*)::int from profile_generation_jobs where user_id=${userId}::uuid and server_id=${serverId}) avatars
  `)) as unknown as Record<string, unknown>[];
  const e = r ?? {};
  const num = (v: unknown) => Number(v ?? 0);
  const opt = (v: unknown) => (v == null ? null : Number(v));
  return {
    joinedDays: Math.max(1, num(e.joined_days)),
    combat: num(e.combat),
    maxEnhance: num(e.max_e),
    sumEnhance: num(e.sum_e),
    ranks: { combat: opt(e.rank_combat), max: opt(e.rank_max), sum: opt(e.rank_sum) },
    attempts: num(e.attempts),
    success: num(e.success),
    hold: num(e.hold),
    down: num(e.down),
    gemReduces: num(e.gem_reduces),
    gemsSpent: num(e.gems_spent),
    totalTrainH: Math.round(num(e.total_elapsed_ms) / 3_600_000),
    boxesOpened: num(e.boxes),
    transcendMax: num(e.t_max),
    transcendSum: num(e.t_sum),
    itemKinds: num(e.item_kinds),
    catalogTotal: num(e.catalog_total),
    meleeJoined: num(e.melee_joined),
    meleeWins: num(e.melee_wins),
    meleeBest: opt(e.melee_best),
    meleePoints: num(e.melee_points),
    raidSummons: num(e.raid_summons),
    raidAttacks: num(e.raid_attacks),
    raidRewards: num(e.raid_rewards),
    checkinDays: num(e.checkin_days),
    friends: num(e.friends),
    guildName: (e.guild_name as string) ?? null,
    guildContribution: num(e.guild_contrib),
    challengesClaimed: num(e.chg_claimed),
    avatarsCreated: num(e.avatars),
  };
}

export type RankPoint = {
  kstDay: string;
  combat: number | null;
  max: number | null;
  sum: number | null;
};

/** 랭킹 추이(3지표) — 최근 31일 자정 스냅샷 + 현재 라이브 1점. 스냅샷은 2026-07-16부터 축적. */
export async function getRankHistory(userId: string, serverId: number): Promise<RankPoint[]> {
  const rows = (await db.execute(sql`
    select kst_day::text kst_day, combat_rank, max_rank, sum_rank
    from user_daily_stats
    where user_id = ${userId}::uuid and server_id = ${serverId} and combat_rank is not null
      and kst_day >= (now() at time zone 'Asia/Seoul')::date - 30
    order by kst_day asc
  `)) as unknown as { kst_day: string; combat_rank: number | null; max_rank: number | null; sum_rank: number | null }[];
  const points: RankPoint[] = rows.map((r) => ({
    kstDay: r.kst_day.slice(0, 10),
    combat: r.combat_rank == null ? null : Number(r.combat_rank),
    max: r.max_rank == null ? null : Number(r.max_rank),
    sum: r.sum_rank == null ? null : Number(r.sum_rank),
  }));
  const now = (await db.execute(sql`
    select metric, rnk from (
      select user_id, metric, row_number() over (partition by metric order by value desc)::int rnk
      from leaderboard_ranks where server_id = ${serverId} and metric in ('combat','max','sum')
    ) t where user_id = ${userId}::uuid
  `)) as unknown as { metric: string; rnk: number }[];
  if (now.length > 0) {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const live: RankPoint = {
      kstDay: today,
      combat: now.find((r) => r.metric === 'combat')?.rnk ?? null,
      max: now.find((r) => r.metric === 'max')?.rnk ?? null,
      sum: now.find((r) => r.metric === 'sum')?.rnk ?? null,
    };
    const last = points[points.length - 1];
    if (!last || last.kstDay !== today) points.push(live);
    else points[points.length - 1] = live; // 오늘 스냅샷보다 라이브가 최신
  }
  return points;
}

export type DailyEnhancePoint = {
  kstDay: string;
  /** 결과별 단련 시간(시간 단위, 소수 1자리) — 시도 횟수는 성장할수록 줄어드는 지표라
   *  y축은 시간으로(고레벨=긴 대기=큰 막대, 2026-07-16 확정). 횟수는 툴팁 병기용. */
  successH: number;
  holdH: number;
  downH: number;
  success: number;
  hold: number;
  down: number;
};
export type DatedRankPoint = { kstDay: string; rank: number };
export type TranscendItem = { name: string; code: string; slot: string; level: number };

export type AllTabExtras = {
  dailyEnhance: DailyEnhancePoint[];
  meleeRanks: DatedRankPoint[]; // 날짜별 대난투 순위(실기록)
  raidRanks: DatedRankPoint[]; // 레이드 처치 랭킹 스냅샷(0122, 축적형)
  meleeWorst: number | null;
  raidBestPhase: number;
  transcendTop: TranscendItem | null;
  transcendBottom: TranscendItem | null;
};

/** 전체 탭 부가 데이터(2026-07-16 재구성) — 일별 강화·대난투/레이드 추이·초월 최고/최저 아이템. */
export async function getAllTabExtras(userId: string, serverId: number): Promise<AllTabExtras> {
  const [daily, melee, raid, extremes, misc] = await Promise.all([
    db.execute(sql`
      select (created_at at time zone 'Asia/Seoul')::date::text d,
             count(*) filter (where result in ('success','mega'))::int success,
             count(*) filter (where result = 'hold')::int hold,
             count(*) filter (where result = 'down')::int down,
             coalesce(sum(elapsed_ms) filter (where result in ('success','mega')), 0)::bigint success_ms,
             coalesce(sum(elapsed_ms) filter (where result = 'hold'), 0)::bigint hold_ms,
             coalesce(sum(elapsed_ms) filter (where result = 'down'), 0)::bigint down_ms
      from enhancement_logs
      where user_id = ${userId}::uuid and server_id = ${serverId}
        and created_at >= (((now() at time zone 'Asia/Seoul')::date - 30)::timestamp at time zone 'Asia/Seoul')
      group by 1 order by 1
    `),
    db.execute(sql`
      select mb.battle_date::text d, mp.final_rank
      from melee_participants mp join melee_battles mb on mb.id = mp.battle_id
      where mp.user_id = ${userId}::uuid and mb.server_id = ${serverId} and mb.status = 'revealed'
        and mb.battle_date >= (now() at time zone 'Asia/Seoul')::date - 30
      order by mb.battle_date
    `),
    db.execute(sql`
      select kst_day::text d, raid_rank from user_daily_stats
      where user_id = ${userId}::uuid and server_id = ${serverId} and raid_rank is not null
        and kst_day >= (now() at time zone 'Asia/Seoul')::date - 30
      order by kst_day asc
    `),
    db.execute(sql`
      (select ci.name, ci.code, ci.slot::text slot, ue.transcend_level lv, 'top' as kind
       from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId}
       order by ue.transcend_level desc, ue.enhance_level desc limit 1)
      union all
      (select ci.name, ci.code, ci.slot::text, ue.transcend_level, 'bottom'
       from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId}
       order by ue.transcend_level asc, ue.enhance_level asc limit 1)
    `),
    db.execute(sql`
      select
        (select max(mp.final_rank)::int from melee_participants mp join melee_battles mb on mb.id = mp.battle_id
          where mp.user_id = ${userId}::uuid and mb.server_id = ${serverId} and mb.status = 'revealed') melee_worst,
        (select coalesce(max(rd.phases_cleared), 0)::int from raid_participants rp join raids rd on rd.id = rp.raid_id
          where rp.user_id = ${userId}::uuid and rd.server_id = ${serverId}) best_phase
    `),
  ]);
  const dailyRows = daily as unknown as { d: string; success: number; hold: number; down: number; success_ms: string; hold_ms: string; down_ms: string }[];
  const meleeRows = melee as unknown as { d: string; final_rank: number }[];
  const raidRows = raid as unknown as { d: string; raid_rank: number }[];
  const exRows = extremes as unknown as { name: string; code: string; slot: string; lv: number; kind: string }[];
  const m = (misc as unknown as { melee_worst: number | null; best_phase: number }[])[0];
  const item = (kind: string): TranscendItem | null => {
    const r = exRows.find((x) => x.kind === kind);
    return r ? { name: r.name, code: r.code, slot: r.slot, level: Number(r.lv) } : null;
  };
  return {
    dailyEnhance: dailyRows.map((r) => ({
      kstDay: r.d.slice(0, 10),
      successH: Math.round((Number(r.success_ms) / 3_600_000) * 10) / 10,
      holdH: Math.round((Number(r.hold_ms) / 3_600_000) * 10) / 10,
      downH: Math.round((Number(r.down_ms) / 3_600_000) * 10) / 10,
      success: r.success,
      hold: r.hold,
      down: r.down,
    })),
    meleeRanks: meleeRows.map((r) => ({ kstDay: r.d.slice(0, 10), rank: Number(r.final_rank) })),
    raidRanks: raidRows.map((r) => ({ kstDay: r.d.slice(0, 10), rank: Number(r.raid_rank) })),
    meleeWorst: m?.melee_worst == null ? null : Number(m.melee_worst),
    raidBestPhase: Number(m?.best_phase ?? 0),
    transcendTop: item('top'),
    transcendBottom: item('bottom'),
  };
}
