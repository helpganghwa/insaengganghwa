// 0008 push_enhance_mode 'batched_1h' 추가. 멱등.
// 실행: bun run scripts/_apply-0008.ts
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
const ddl = readFileSync('lib/db/manual/0008_push_batched_1h.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0008 applied');
  const labels = (await sql`
    select enumlabel from pg_enum
    where enumtypid = (select oid from pg_type where typname = 'push_enhance_mode')
    order by enumsortorder
  `) as unknown as Array<{ enumlabel: string }>;
  console.log('  push_enhance_mode values:', labels.map((l) => l.enumlabel).join(', '));
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
