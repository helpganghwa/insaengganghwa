// 0014 mailbox.expires_at DEFAULT 30d → 7d. 멱등(SET DEFAULT는 항상 안전).
// 실행: bun run scripts/_apply-0014.ts
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
const ddl = readFileSync('lib/db/manual/0014_mail_expire_7d.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  // 검증.
  const rows = await sql<{ column_default: string | null }[]>`
    select column_default
    from information_schema.columns
    where table_name = 'mailbox' and column_name = 'expires_at'
  `;
  console.log(`✓ 0014 applied. new default: ${rows[0]?.column_default ?? '(null)'}`);
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
