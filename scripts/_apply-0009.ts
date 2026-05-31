// 0009 enhance_result 'mega' 추가. 멱등.
// 실행: bun run scripts/_apply-0009.ts
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
const ddl = readFileSync('lib/db/manual/0009_enhance_result_mega.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0009 applied');
  const labels = (await sql`
    select enumlabel from pg_enum
    where enumtypid = (select oid from pg_type where typname = 'enhance_result')
    order by enumsortorder
  `) as unknown as Array<{ enumlabel: string }>;
  console.log('  enhance_result values:', labels.map((l) => l.enumlabel).join(', '));
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
