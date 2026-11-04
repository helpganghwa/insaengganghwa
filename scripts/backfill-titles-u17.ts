// 소규모 업데이트 17 숨김 칭호 소급(2026-11-04, 1회성) — 이벤트 훅으로만 지급되는 5종을 배포 전 기록으로 채운다.
//   강화 3종(바늘구멍·찾을 수 없음·신데렐라): enhancement_logs — 지금 캐릭터 생성 이후 기록만(재가입 캐릭터는 옛 기록 제외).
//   점령전 2종(혈혈단신·최후의 보루): 공개된 전투일마다 aggregateConquestDay의 soloFeats(지급 훅과 같은 함수).
//   연대기 3종은 judge 판정(칭호 화면 진입)이 지난 연대기까지 세므로 소급이 필요 없다.
// 기준 값은 훅과 같은 상수(moment-rules.ts·chronicle.ts)를 쓴다.
//
// 실행: bun --conditions=react-server scripts/backfill-titles-u17.ts --db=staging|prod [--confirm]
//   기본은 드라이런(읽기 전용 트랜잭션으로 대상만 센다). --confirm이면 user_titles에 넣는다(멱등, PK).
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const confirm = process.argv.includes('--confirm');
const target = arg('db');
const URL = target === 'prod' ? process.env.PROD_DATABASE_URL : target === 'staging' ? process.env.DATABASE_URL : undefined;
if (!URL) {
  console.error('--db=staging|prod 필요');
  process.exit(1);
}
// aggregateConquestDay가 쓰는 공용 db 클라이언트도 같은 DB를 보게 한다(모듈을 불러오기 전에).
process.env.DATABASE_URL = URL;

const { NEEDLE_MAX_RATE_BP, NOT_FOUND_LEVEL, soloFeatTitle } = await import('../lib/game/titles/moment-rules');
const { aggregateConquestDay } = await import('../lib/game/guild/conquest/chronicle');

type Row = { user_id: string; server_id: number; code: string };
const sql = postgres(URL, { prepare: false, max: 1 });

try {
  const enh = await sql.begin('read only', async (tx) => {
    await tx`set local statement_timeout = '300s'`;
    return tx<Row[]>`
      with lg as (
        select el.user_id, el.server_id, el.result, el.from_level, el.to_level, el.effective_rate_bp, el.created_at
          from enhancement_logs el
          join characters c on c.user_id = el.user_id and c.server_id = el.server_id and el.created_at >= c.created_at
          join profiles p on p.id = el.user_id and p.withdrawn_at is null
      )
      select distinct user_id::text, server_id::int, 'enh_needle' as code from lg
       where result in ('success', 'mega') and effective_rate_bp <= ${NEEDLE_MAX_RATE_BP}
      union
      select distinct user_id::text, server_id::int, 'enh_404' from lg
       where to_level = ${NOT_FOUND_LEVEL} and from_level <> ${NOT_FOUND_LEVEL}
      union
      select distinct user_id::text, server_id::int, 'enh_midnight' from lg
       where (created_at at time zone 'Asia/Seoul')::time < time '00:00:01'`;
  });

  const days = await sql<{ server_id: number; d: string }[]>`
    select distinct server_id::int, battle_kst_day::text as d from conquest_battles
     where published_at is not null order by 1, 2`;
  // 점령전도 강화와 같은 기준 — 탈퇴하지 않았고, 그 전투일이 지금 캐릭터 생성일 이후인 사람만.
  const chars = new Map(
    (await sql<{ k: string; d: string }[]>`
      select c.user_id::text || '|' || c.server_id as k, (c.created_at at time zone 'Asia/Seoul')::date::text as d
        from characters c join profiles p on p.id = c.user_id and p.withdrawn_at is null`).map((r) => [r.k, r.d] as const),
  );
  const cq: Row[] = [];
  const seen = new Set<string>();
  for (const { server_id, d } of days) {
    const s = await aggregateConquestDay(d, server_id);
    for (const f of s.soloFeats) {
      const born = chars.get(`${f.userId}|${server_id}`);
      if (!born || d < born) continue;
      const code = soloFeatTitle(f.kind);
      const k = `${f.userId}|${server_id}|${code}`;
      if (!seen.has(k)) cq.push({ user_id: f.userId, server_id, code });
      seen.add(k);
      console.log(`  ${d} s${server_id} ${code} ${f.zone} ${f.userId.slice(0, 8)}`);
    }
  }

  const all = [...enh, ...cq];
  const owned = new Set(
    (await sql<{ k: string }[]>`
      select user_id::text || '|' || server_id || '|' || title_code as k from user_titles
       where title_code in ('enh_needle', 'enh_404', 'enh_midnight', 'cq_solo_take', 'cq_solo_hold')`).map((r) => r.k),
  );
  const todo = all.filter((r) => !owned.has(`${r.user_id}|${r.server_id}|${r.code}`));
  const by = new Map<string, number>();
  for (const r of todo) by.set(r.code, (by.get(r.code) ?? 0) + 1);
  console.log(`[${target}] 전투일 ${days.length}일 · 대상 ${todo.length}건`, Object.fromEntries(by));
  if (!confirm) {
    console.log('드라이런 — --confirm으로 적용');
  } else if (todo.length) {
    await sql.begin(async (tx) => {
      for (const r of todo) {
        await tx`insert into user_titles (user_id, server_id, title_code)
                 values (${r.user_id}::uuid, ${r.server_id}, ${r.code}) on conflict do nothing`;
      }
    });
    console.log(`적용 ${todo.length}건`);
  }
} catch (e) {
  console.error('[backfill-titles-u17] 실패', e);
  process.exitCode = 1;
} finally {
  await sql.end();
  process.exit(process.exitCode ?? 0);
}
