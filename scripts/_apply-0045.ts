// 0045 레이드 길드 공개 + 참가요청 테이블. 멱등. 실행: bun run scripts/_apply-0045.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0045_raid_guild_visibility_join_requests.sql', 'utf8'));
  const [col] = await sql`select 1 from information_schema.columns where table_name='raids' and column_name='visible_to_guild'`;
  const [tbl] = await sql`select 1 from information_schema.tables where table_name='raid_join_requests'`;
  console.log('✓ 0045 적용 — raids.visible_to_guild:', !!col, '· raid_join_requests:', !!tbl);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
