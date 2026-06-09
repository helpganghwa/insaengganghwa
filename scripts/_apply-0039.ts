// 0039 세금 모델 변경(tax_points→tax_diamond, tax_pool_points→tax_pool_diamond). 멱등. 실행: bun run scripts/_apply-0039.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0039_tax_diamond.sql', 'utf8'));
  console.log('✓ 0039 적용 — zones.tax_diamond / guilds.tax_pool_diamond 로 rename');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
