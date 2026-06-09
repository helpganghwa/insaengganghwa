// 0042 zones.lord_user_id → executor_user_id 개명. 멱등. 실행: bun run scripts/_apply-0042.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0042_rename_executor.sql', 'utf8'));
  const [col] = await sql`
    select column_name from information_schema.columns
    where table_name = 'zones' and column_name in ('lord_user_id','executor_user_id')`;
  console.log('✓ 0042 적용 — zones 컬럼:', col?.column_name ?? '(없음)');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
