// 0011 push_category 'referral' + profiles.push_referral 적용. 멱등.
// 실행: bun run scripts/_apply-0011.ts
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
const ddl = readFileSync('lib/db/manual/0011_push_referral.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0011 applied');
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
