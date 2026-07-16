// 오늘의 인생강화 — 배포 직후 1회: 오늘 자정 기준선이 없으면(첫 배포일) 지금 시점으로 시드.
// 이후는 자정 크론(daily-stats)이 담당. 멱등(on conflict do nothing).
// 실행: bun run scripts/seed-daily-stats-today.ts [PROD_DATABASE_URL]
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const env = process.argv[2] ?? 'DATABASE_URL';
const sql = postgres(process.env[env]!, { prepare: false, max: 1 });
const rows = await sql`
  with lr as (
    select user_id, server_id, metric, value,
           row_number() over (partition by server_id, metric order by value desc)::int rnk
    from leaderboard_ranks where metric in ('combat','max','sum','raid')
  )
  insert into user_daily_stats (user_id, server_id, kst_day, combat, max_enhance, sum_enhance, combat_rank, max_rank, sum_rank, raid_rank)
  select user_id, server_id, (now() at time zone 'Asia/Seoul')::date,
         coalesce(max(case when metric='combat' then value end),0),
         coalesce(max(case when metric='max' then value end),0),
         coalesce(max(case when metric='sum' then value end),0),
         max(case when metric='combat' then rnk end),
         max(case when metric='max' then rnk end),
         max(case when metric='sum' then rnk end),
         max(case when metric='raid' then rnk end)
  from lr group by user_id, server_id
  on conflict do nothing
  returning user_id`;
console.log(`[${env}] 오늘 기준선 시드 ${rows.length}행`);
await sql.end();
