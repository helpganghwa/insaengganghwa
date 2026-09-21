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
        )
        insert into user_daily_stats (user_id, server_id, kst_day, combat, max_enhance, sum_enhance, combat_rank, max_rank, sum_rank, raid_rank)
        select user_id, ${serverId}, (now() at time zone 'Asia/Seoul')::date,
               coalesce(max(case when metric = 'combat' then value end), 0),
               coalesce(max(case when metric = 'max' then value end), 0),
               coalesce(max(case when metric = 'sum' then value end), 0),
               max(case when metric = 'combat' then rnk end),
               max(case when metric = 'max' then rnk end),
               max(case when metric = 'sum' then rnk end),
               max(case when metric = 'raid' then rnk end)
        from lr
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
