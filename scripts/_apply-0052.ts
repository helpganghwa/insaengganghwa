// 0052 구역 인접 그래프 재시드(전략적). 멱등. 실행: bun run scripts/_apply-0052.ts
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
  await sql.unsafe(readFileSync('lib/db/manual/0052_zone_adjacency_strategic.sql', 'utf8'));
  const [{ n }] = await sql`select count(*)::int n from zone_adjacency`;
  console.log('✓ 0052 적용 — zone_adjacency 간선(전략적):', n);
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
