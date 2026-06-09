// 0043 길드 가입 방식 + 가입 신청 테이블. 멱등. 실행: bun run scripts/_apply-0043.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0043_guild_join_policy.sql', 'utf8'));
  const [col] = await sql`
    select column_name from information_schema.columns
    where table_name = 'guilds' and column_name = 'join_policy'`;
  const [tbl] = await sql`
    select table_name from information_schema.tables where table_name = 'guild_join_requests'`;
  console.log('✓ 0043 적용 — guilds.join_policy:', !!col, '· guild_join_requests:', !!tbl);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
