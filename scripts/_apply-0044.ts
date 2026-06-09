// 0044 신규 유저 거주지 자동 배정 + 백필. 멱등. 실행: bun run scripts/_apply-0044.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0044_default_residence.sql', 'utf8'));
  const [{ n }] = await sql`select count(*)::int n from profiles where residence_zone_id is null`;
  console.log('✓ 0044 적용 — 거주지 트리거 생성 · 잔여 미배정 유저:', n);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
