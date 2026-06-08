// 0035 대난투 우편 battleId 백필. 멱등. 실행: bun run scripts/_apply-0035.ts
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
  const res = await sql.unsafe(readFileSync('lib/db/manual/0035_mail_melee_battleid_backfill.sql', 'utf8'));
  console.log('✓ 0035 적용 — 대난투 우편 battleId 백필', res.count ?? '');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
