// 도전 과제 이벤트형 소급(0118, 2026-07-15 1회성) — 기능 배포 전 기존 유저 완료 처리.
//   avatar_change: active_profile_id가 커스텀 생성 아바타(잡 산출물)면 "변경했음"이 확실 → 마킹.
//   (boast_share·residence_move는 과거 흔적 없음 — 소급 불가. app_install은 앱 접속 시 자동 마킹.)
// 나머지 26종은 상태 파생이라 소급 불필요(기존 데이터로 자동 '달성' 판정).
//
// 실행: bun run scripts/backfill-challenge-events.ts --db=staging|prod [--confirm]
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const target = arg('db');
const URL = target === 'prod' ? process.env.PROD_DATABASE_URL : target === 'staging' ? process.env.DATABASE_URL : undefined;
if (!URL) { console.error('--db=staging|prod 필요'); process.exit(1); }

const sql = postgres(URL, { prepare: false, max: 1 });
try {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int n
    from characters c
    join profile_generation_jobs j on j.user_profile_id = c.active_profile_id
    where c.active_profile_id is not null
      and not exists (select 1 from challenge_events e
        where e.user_id = c.user_id and e.server_id = c.server_id and e.event_id = 'avatar_change')`;
  console.log(`[${target}] avatar_change 소급 대상: ${n}명`);
  if (!confirm) { console.log('드라이런 — --confirm으로 적용'); process.exit(0); }
  const ins = await sql`
    insert into challenge_events (user_id, server_id, event_id)
    select c.user_id, c.server_id, 'avatar_change'
    from characters c
    join profile_generation_jobs j on j.user_profile_id = c.active_profile_id
    where c.active_profile_id is not null
    on conflict do nothing
    returning user_id`;
  console.log(`✅ ${ins.length}건 마킹 완료`);
} finally { await sql.end(); }
