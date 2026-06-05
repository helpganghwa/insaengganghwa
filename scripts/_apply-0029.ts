// 0029 어드민 발송 감사 로그 테이블. 멱등(IF NOT EXISTS). 실행: bun run scripts/_apply-0029.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0029_admin_mail_logs.sql', 'utf8'));
  console.log('✓ 0029 적용 — admin_mail_logs 생성');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
