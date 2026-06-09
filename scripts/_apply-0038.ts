// 0038 zones 재시드(왕국 맵) — enum 'kingdom'·'angel' ADD VALUE(별도 tx) + DELETE/INSERT. 멱등.
// 선행: 0036. 실행: bun run scripts/_apply-0038.ts
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
  // ADD VALUE는 같은 tx 내 사용 불가 → 먼저 각각 커밋.
  await sql.unsafe(`ALTER TYPE zone_region ADD VALUE IF NOT EXISTS 'kingdom'`);
  await sql.unsafe(`ALTER TYPE zone_region ADD VALUE IF NOT EXISTS 'angel'`);
  await sql.unsafe(readFileSync('lib/db/manual/0038_zones_kingdom.sql', 'utf8'));
  console.log('✓ 0038 적용 — zone_region(kingdom·angel 추가) + zones 50구역 재시드(왕국 맵)');
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
