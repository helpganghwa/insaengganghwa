// 0007 테스트 보너스 trigger 적용(일회성) — DIRECT_URL(session pooler).
// 실행: bun run scripts/_apply-0007.ts
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const ddl = readFileSync('lib/db/manual/0007_test_signup_bonus.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0007 applied (handle_new_user: diamond 10000 + supply 100/slot)');

  // 함수 정의 확인 — 새 값(10000, 100)이 포함됐는지.
  const [{ src }] = (await sql`
    select pg_get_functiondef(p.oid) as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  `) as unknown as Array<{ src: string }>;
  const has10000 = /10000/.test(src);
  const has100 = /100/.test(src);
  console.log(`  contains '10000' diamond: ${has10000}`);
  console.log(`  contains '100' supply:    ${has100}`);
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
