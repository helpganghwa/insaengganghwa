import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

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

export type TodayDetail = TodayTicker & {
  kstDay: string;
  combatRank: number | null;
  combatRankPrev: number | null;
  melee: { myRank: number | null; total: number; prevRank: number | null; top3: { rank: number; nickname: string }[] } | null;
  boxesOpened: number;
  transcendUps: number;
  streakDays: number;
};

/** 상세 페이지 — 티커 payload + 랭킹 변동·대난투·수집·스트릭(병렬 1묶음). */
export async function getTodayDetail(userId: string, serverId: number): Promise<TodayDetail> {
  const [ticker, extra] = await Promise.all([
    getTodayTicker(userId, serverId),
    db.execute(sql`
      with today_day as (select (now() at time zone 'Asia/Seoul')::date d),
      rank_now as (
        select rnk from (
          select user_id, row_number() over (order by value desc)::int rnk
          from leaderboard_ranks where server_id = ${serverId} and metric = 'combat'
        ) t where user_id = ${userId}::uuid
      ),
      rank_prev as (
        select combat_rank from user_daily_stats
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
      days as (select distinct kst_day from checkin_claim_logs
        where user_id = ${userId}::uuid and server_id = ${serverId}
        order by kst_day desc limit 60)
      select
        (select rnk from rank_now) rank_now,
        (select combat_rank from rank_prev) rank_prev,
        (select final_rank from melee_participants where battle_id = (select id from battle) and user_id = ${userId}::uuid) melee_rank,
        (select count(*)::int from melee_participants where battle_id = (select id from battle)) melee_total,
        (select final_rank from melee_participants where battle_id = (select id from battle_prev) and user_id = ${userId}::uuid) melee_prev,
        (select json_agg(json_build_object('rank', mp.final_rank, 'nickname', c.nickname) order by mp.final_rank)
           from melee_participants mp join characters c on c.user_id = mp.user_id and c.server_id = ${serverId}
           where mp.battle_id = (select id from battle) and mp.final_rank <= 3) melee_top3,
        (select n from boxes) boxes_opened,
        (select n from tups) transcend_ups,
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
    let cursor = new Date(`${kstDay}T12:00:00Z`);
    if (days[0] !== kstDay) cursor.setUTCDate(cursor.getUTCDate() - 1); // 오늘 미출석 허용
    for (const d of days) {
      const want = cursor.toISOString().slice(0, 10);
      if (d !== want) break;
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  const meleeTotal = Number(e.melee_total ?? 0);
  return {
    ...ticker,
    kstDay,
    combatRank: e.rank_now == null ? null : Number(e.rank_now),
    combatRankPrev: e.rank_prev == null ? null : Number(e.rank_prev),
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
    streakDays: streak,
  };
}

export type PeriodStats = {
  days: number;
  combatDelta: number | null; // 기간 시작 스냅샷 부재 시 null(스냅샷은 2026-07-16부터 축적)
  sumGained: number; // 로그 기반(Σ to-from) — 스냅샷 무관 정확
  attempts: number;
  success: number;
  hold: number;
  down: number;
  boxesOpened: number;
  transcendUps: number;
  meleeJoined: number;
  meleeWins: number;
  meleeBest: number | null;
  raidAttacks: number;
};

/** 기간 통계(7·30일) — 로그 집계 중심(정확), 전투력 ▲만 기간 시작 스냅샷 필요. */
export async function getPeriodStats(userId: string, serverId: number, days: 7 | 30): Promise<PeriodStats> {
  const [r] = (await db.execute(sql`
    with since as (
      select (((now() at time zone 'Asia/Seoul')::date - ${days})::timestamp at time zone 'Asia/Seoul') ts,
             ((now() at time zone 'Asia/Seoul')::date - ${days}) d
    ),
    logs as (
      select count(*)::int attempts,
             count(*) filter (where result in ('success','mega'))::int success,
             count(*) filter (where result = 'hold')::int hold,
             count(*) filter (where result = 'down')::int down,
             coalesce(sum(to_level - from_level), 0)::int sum_gained
      from enhancement_logs
      where user_id = ${userId}::uuid and server_id = ${serverId} and created_at >= (select ts from since)
    ),
    snap as (
      select combat from user_daily_stats
      where user_id = ${userId}::uuid and server_id = ${serverId} and kst_day = (select d from since)
    ),
    melee as (
      select count(*)::int joined,
             count(*) filter (where mp.final_rank = 1)::int wins,
             min(mp.final_rank)::int best
      from melee_participants mp join melee_battles mb on mb.id = mp.battle_id
      where mp.user_id = ${userId}::uuid and mb.server_id = ${serverId} and mb.battle_date >= (select d from since)
    )
    select
      (select attempts from logs) attempts, (select success from logs) success,
      (select hold from logs) hold, (select down from logs) down,
      (select sum_gained from logs) sum_gained,
      (select combat from snap)::bigint snap_combat,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='combat'), 0)::bigint combat_now,
      (select count(*)::int from supply_open_logs where user_id=${userId}::uuid and server_id=${serverId} and created_at >= (select ts from since)) boxes,
      (select coalesce(sum(to_t - from_t),0)::int from transcend_logs where user_id=${userId}::uuid and server_id=${serverId} and created_at >= (select ts from since)) tups,
      (select joined from melee) melee_joined, (select wins from melee) melee_wins, (select best from melee) melee_best,
      (select count(*)::int from raid_attacks ra join raids rd on rd.id = ra.raid_id
        where ra.user_id=${userId}::uuid and rd.server_id=${serverId} and ra.created_at >= (select ts from since)) raid_attacks
  `)) as unknown as Record<string, unknown>[];
  const e = r ?? {};
  return {
    days,
    combatDelta: e.snap_combat == null ? null : Number(e.combat_now) - Number(e.snap_combat),
    sumGained: Number(e.sum_gained ?? 0),
    attempts: Number(e.attempts ?? 0),
    success: Number(e.success ?? 0),
    hold: Number(e.hold ?? 0),
    down: Number(e.down ?? 0),
    boxesOpened: Number(e.boxes ?? 0),
    transcendUps: Number(e.tups ?? 0),
    meleeJoined: Number(e.melee_joined ?? 0),
    meleeWins: Number(e.melee_wins ?? 0),
    meleeBest: e.melee_best == null ? null : Number(e.melee_best),
    raidAttacks: Number(e.raid_attacks ?? 0),
  };
}

export type LifetimeStats = {
  joinedDays: number;
  combat: number;
  maxEnhance: number;
  sumEnhance: number;
  attempts: number;
  success: number;
  boxesOpened: number;
  transcendMax: number;
  meleeJoined: number;
  meleeWins: number;
  raidAttacks: number;
  itemKinds: number;
};

/** 통산(전체) — 대장장이 이력서. */
export async function getLifetimeStats(userId: string, serverId: number): Promise<LifetimeStats> {
  const [r] = (await db.execute(sql`
    select
      greatest(1, ((now() at time zone 'Asia/Seoul')::date
        - ((select created_at from characters where user_id=${userId}::uuid and server_id=${serverId}) at time zone 'Asia/Seoul')::date) + 1)::int joined_days,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='combat'),0)::bigint combat,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='max'),0)::bigint max_e,
      coalesce((select value from leaderboard_ranks where server_id=${serverId} and user_id=${userId}::uuid and metric='sum'),0)::bigint sum_e,
      (select count(*)::int from enhancement_logs where user_id=${userId}::uuid and server_id=${serverId}) attempts,
      (select count(*) filter (where result in ('success','mega'))::int from enhancement_logs where user_id=${userId}::uuid and server_id=${serverId}) success,
      (select count(*)::int from supply_open_logs where user_id=${userId}::uuid and server_id=${serverId}) boxes,
      (select coalesce(max(transcend_level),0)::int from user_equipment where user_id=${userId}::uuid and server_id=${serverId}) t_max,
      (select count(*)::int from melee_participants mp join melee_battles mb on mb.id=mp.battle_id where mp.user_id=${userId}::uuid and mb.server_id=${serverId}) melee_joined,
      (select count(*)::int from melee_participants mp join melee_battles mb on mb.id=mp.battle_id where mp.user_id=${userId}::uuid and mb.server_id=${serverId} and mp.final_rank=1) melee_wins,
      (select count(*)::int from raid_attacks ra join raids rd on rd.id=ra.raid_id where ra.user_id=${userId}::uuid and rd.server_id=${serverId}) raid_attacks,
      (select count(*)::int from user_equipment where user_id=${userId}::uuid and server_id=${serverId}) item_kinds
  `)) as unknown as Record<string, unknown>[];
  const e = r ?? {};
  return {
    joinedDays: Number(e.joined_days ?? 1),
    combat: Number(e.combat ?? 0),
    maxEnhance: Number(e.max_e ?? 0),
    sumEnhance: Number(e.sum_e ?? 0),
    attempts: Number(e.attempts ?? 0),
    success: Number(e.success ?? 0),
    boxesOpened: Number(e.boxes ?? 0),
    transcendMax: Number(e.t_max ?? 0),
    meleeJoined: Number(e.melee_joined ?? 0),
    meleeWins: Number(e.melee_wins ?? 0),
    raidAttacks: Number(e.raid_attacks ?? 0),
    itemKinds: Number(e.item_kinds ?? 0),
  };
}
