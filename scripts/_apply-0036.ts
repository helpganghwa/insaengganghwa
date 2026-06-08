// 0036 길드 스키마(테이블·enum·profiles.residence_zone_id). 멱등. 실행: bun run scripts/_apply-0036.ts
// ⚠ 길드는 "마지막 콘텐츠" — 공유/프로덕션 DB에 적용되므로 적용 시점 신중히. zones 시드는 별도.
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
  await sql.unsafe(readFileSync('lib/db/manual/0036_guild.sql', 'utf8'));
  console.log('✓ 0036 적용 — 길드 테이블 7종 + enum 3종 + profiles.residence_zone_id 생성');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
