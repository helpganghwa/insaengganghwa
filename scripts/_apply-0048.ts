// 0048 profiles.last_seen_at 추가(멱등 — add column if not exists).
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0048_profiles_last_seen.sql', 'utf8'));
  const [c] = await sql`select 1 from information_schema.columns where table_name='profiles' and column_name='last_seen_at'`;
  console.log('✓ 0048 — profiles.last_seen_at:', c ? '존재' : '실패');
} catch (e) { console.error('✗', (e as Error).message); process.exit(1); }
finally { await sql.end(); }
