/**
 * 오늘의 인생강화 — KST 자정 스냅샷 크론(0120). leaderboard_ranks(combat/max/sum) 피벗으로
 * 유저별 기준선 1행 기록 + 31일 지난 행 정리(주간·월간 비교용 보존). :00 혼잡 회피 1분 오프셋(UTC 15:01 = KST 00:01).
 * 멱등: PK on conflict do nothing — 재실행·중복 발화 무해.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
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
    for (const serverId of servers) {
      const rows = (await db.execute(sql`
        with lr as (
          select user_id, metric, value,
                 row_number() over (partition by metric order by value desc)::int as rnk
          from leaderboard_ranks
          where server_id = ${serverId} and metric in ('combat', 'max', 'sum')
        )
        insert into user_daily_stats (user_id, server_id, kst_day, combat, max_enhance, sum_enhance, combat_rank, max_rank, sum_rank)
        select user_id, ${serverId}, (now() at time zone 'Asia/Seoul')::date,
               coalesce(max(case when metric = 'combat' then value end), 0),
               coalesce(max(case when metric = 'max' then value end), 0),
               coalesce(max(case when metric = 'sum' then value end), 0),
               max(case when metric = 'combat' then rnk end),
               max(case when metric = 'max' then rnk end),
               max(case when metric = 'sum' then rnk end)
        from lr
        group by user_id
        on conflict do nothing
        returning user_id
      `)) as unknown as { user_id: string }[];
      inserted += rows.length;
    }
    await db.execute(
      sql`delete from user_daily_stats where kst_day < (now() at time zone 'Asia/Seoul')::date - 31`,
    );
    return Response.json({ ok: true, inserted });
  } catch (e) {
    console.error('[daily-stats]', e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
