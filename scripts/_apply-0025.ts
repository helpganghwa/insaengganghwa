// 0025 배틀패스 테이블. 추가형·멱등. 실행: bun run scripts/_apply-0025.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) { console.error('DIRECT_URL/DATABASE_URL missing'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0025_battlepass.sql', 'utf8'));
  console.log('✓ 0025 적용 완료');
  const [t] = await sql`select
    (select count(*) from information_schema.tables where table_schema='public' and table_name='battlepass_state')::int s,
    (select count(*) from information_schema.tables where table_schema='public' and table_name='battlepass_segments')::int g`;
  console.log('테이블 존재:', JSON.stringify(t));
} catch (e) { console.error('✗', (e as Error).message); process.exit(1); }
finally { await sql.end(); }
