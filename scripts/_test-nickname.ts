// 닉네임 변경 CTE 디버그(일회성) — 트랜잭션 롤백이라 실제 변경 없음.
// 실행: bun run scripts/_test-nickname.ts
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
const [u] = await sql`select id, nickname, nickname_changed_count as cnt, diamond::text from profiles limit 1`;
console.log('대상:', u.nickname, '| cnt:', u.cnt, '| diamond:', u.diamond);

const next = '테스트' + Math.floor(Math.random() * 100000);
try {
  await sql.begin(async (tx) => {
    const rows = await tx.unsafe(`
      with curr as (
        select id, diamond, nickname_changed_count as cnt from profiles where id = '${u.id}'::uuid for update
      ),
      cost as (select case when cnt = 0 then 0 else 1000 end as c from curr),
      upd as (
        update profiles p set nickname = '${next}', nickname_changed_count = p.nickname_changed_count + 1,
          diamond = p.diamond - (select c from cost), updated_at = now()
        from curr, cost where p.id = curr.id and curr.diamond >= cost.c
        returning p.nickname_changed_count as cnt, p.diamond, cost.c as charged
      )
      select cnt, diamond::text as diamond, charged from upd
    `);
    console.log('CTE 결과 rows:', rows);
    console.log('rows.length:', rows.length, '| Array.isArray:', Array.isArray(rows));
    throw new Error('__rollback__');
  });
} catch (e) {
  if ((e as Error).message === '__rollback__') console.log('✓ 롤백됨(실제 변경 없음)');
  else console.error('✗ CTE 에러:', (e as Error).message);
}
await sql.end();
