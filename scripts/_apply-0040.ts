// 0040 zones.tax_points 추가(세금 2단계). 멱등. 실행: bun run scripts/_apply-0040.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0040_zone_tax_points.sql', 'utf8'));
  console.log('✓ 0040 적용 — zones.tax_points 추가(포인트 누적기)');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
