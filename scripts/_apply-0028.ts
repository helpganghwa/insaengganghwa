// 0028 가입 보너스 ×10→×5 — handle_new_user 갱신. 멱등(create or replace). 실행: bun run scripts/_apply-0028.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0028_signup_bonus_x5.sql', 'utf8'));
  console.log('✓ 0028 적용 — handle_new_user: 다이아 5000 / 보급상자 50/슬롯');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
