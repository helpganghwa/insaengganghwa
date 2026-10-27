/**
 * 오늘의 인생강화 — KST 자정 스냅샷 크론(0120). leaderboard_ranks(combat/max/sum) 피벗으로
 * 유저별 기준선 1행 기록 + 31일 지난 행 정리(주간·월간 비교용 보존). :00 혼잡 회피 1분 오프셋(UTC 15:01 = KST 00:01).
 * 멱등: PK on conflict do nothing — 재실행·중복 발화 무해.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { db } from '@/lib/db/client';
import { openServerIds } from '@/lib/game/server-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    const servers = await openServerIds();
    let inserted = 0;
    // 서버별 에러 격리(2026-09-21 ⑧) — 종전에는 한 서버의 실패가 그 자리에서 throw돼 뒤 서버
    // 스냅샷과 31일 정리가 통째로 건너뛰어졌다. 하루 1틱이라 재시도도 없어 그날 기준선이 빈다.
    const results: { serverId: number; inserted?: number; error?: string }[] = [];
    for (const serverId of servers) {
      try {
        const rows = (await db.execute(sql`
          with lr as (
            select user_id, metric, value,
                   row_number() over (partition by metric order by value desc)::int as rnk
            from leaderboard_ranks
            where server_id = ${serverId} and metric in ('combat', 'max', 'sum', 'raid')
          ),
          -- 이 크론은 자정 1~2분 뒤에 돈다. 그 사이 수령한 강화는 기준선에 먼저 들어가면서 '오늘의 강화'
          -- 성공·하락 횟수(자정부터 셈)에도 세어져, 합산의 '어제와 비교'가 그만큼 어긋났다(2026-10-27 문의 #1MizQ9lS).
          -- 합산은 자정 이후 강화 로그의 단계 변화를 빼서 자정 시점 값으로 되짚는다(전투력·최고 강화는 되짚을 수 없어 그대로).
          -- 유저마다 (user_id, created_at) 인덱스로 찾는다 — 서버·시각 조건만으로 훑으면 12초(10-27 실측), 이 형태는 수 ms.
          since_midnight as (
            select e.user_id, sum(e.to_level - e.from_level)::bigint d
            from (select distinct user_id from lr) u
            join enhancement_logs e
              on e.user_id = u.user_id and e.server_id = ${serverId}
             and e.created_at >= ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
            group by e.user_id
          )
          insert into user_daily_stats (user_id, server_id, kst_day, combat, max_enhance, sum_enhance, combat_rank, max_rank, sum_rank, raid_rank)
          select user_id, ${serverId}, (now() at time zone 'Asia/Seoul')::date,
                 coalesce(max(case when metric = 'combat' then value end), 0),
                 coalesce(max(case when metric = 'max' then value end), 0),
                 greatest(coalesce(max(case when metric = 'sum' then value end), 0) - coalesce(max(sm.d), 0), 0),
                 max(case when metric = 'combat' then rnk end),
                 max(case when metric = 'max' then rnk end),
                 max(case when metric = 'sum' then rnk end),
                 max(case when metric = 'raid' then rnk end)
          from lr
          left join since_midnight sm using (user_id)
          group by user_id
          on conflict do nothing
          returning user_id
        `)) as unknown as { user_id: string }[];
        inserted += rows.length;
        results.push({ serverId, inserted: rows.length });
      } catch (se) {
        console.error('[daily-stats] server', serverId, se);
        results.push({ serverId, error: (se as Error).message });
      }
    }
    // 보존 정리는 서버와 무관 — 한 서버가 실패해도 돌려야 한다.
    let pruned = true;
    try {
      await db.execute(
        sql`delete from user_daily_stats where kst_day < (now() at time zone 'Asia/Seoul')::date - 31`,
      );
    } catch (pe) {
      pruned = false;
      console.error('[daily-stats] prune', pe);
    }
    const ok = pruned && results.every((r) => r.error === undefined);
    // 성공일 때만 하트비트 — '돌긴 했는데 한 서버가 실패'를 dead-man이 잡는다(감시 대상 등재 필요).
    if (ok) await beatCron('daily-stats', `inserted=${inserted} servers=${results.length}`);
    return Response.json({ ok, inserted, results, kind: 'daily-stats' }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error('[daily-stats]', e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
