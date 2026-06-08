// 0034 출석 14일 전환 — 진행도 리셋. 멱등. 실행: bun run scripts/_apply-0034.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0034_checkin_14day_reset.sql', 'utf8'));
  console.log('✓ 0034 적용 — 출석 진행도 리셋(14일 전환)');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
