// 0049 guild_emblems 테이블 + guilds.active_emblem_id + 기존 단일 문양 백필(멱등).
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0049_guild_emblems.sql', 'utf8'));
  const [t] = await sql`select count(*)::int n from guild_emblems`;
  const [a] = await sql`select count(*)::int n from guilds where active_emblem_id is not null`;
  console.log('✓ 0049 — guild_emblems 행:', t.n, '· active 설정된 길드:', a.n);
} catch (e) { console.error('✗', (e as Error).message); process.exit(1); }
finally { await sql.end(); }
