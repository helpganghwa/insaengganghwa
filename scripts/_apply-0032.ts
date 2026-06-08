// 0032 친구 링크 테이블. 멱등. 실행: bun run scripts/_apply-0032.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0032_friend_links.sql', 'utf8'));
  console.log('✓ 0032 적용 — friend_links 생성');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
