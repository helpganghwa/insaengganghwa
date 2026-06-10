// 0046 world_chronicle 테이블. 멱등. 실행: bun run scripts/_apply-0046.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0046_world_chronicle.sql', 'utf8'));
  const [t] = await sql`select 1 from information_schema.tables where table_name='world_chronicle'`;
  console.log('✓ 0046 적용 — world_chronicle:', !!t);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
