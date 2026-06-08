// 0037 zones 50구역 시드. 멱등(ON CONFLICT DO NOTHING). 선행: 0036. 실행: bun run scripts/_apply-0037.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0037_zones_seed.sql', 'utf8'));
  console.log('✓ 0037 적용 — zones 50구역 시드');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
