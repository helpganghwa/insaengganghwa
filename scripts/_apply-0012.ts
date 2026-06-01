// 0012 supply_open_logs.gem_drop 컬럼 제거. 멱등.
// 실행: bun run scripts/_apply-0012.ts
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
const ddl = readFileSync('lib/db/manual/0012_supply_drop_gem.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0012 applied');
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
