// 0006 기본 프로필 시드 SQL 적용(일회성) — DIRECT_URL(session pooler)로 직접 실행.
// 멱등(재실행 안전). 실행: bun run scripts/_apply-0006.ts
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
const ddl = readFileSync('lib/db/manual/0006_default_profiles.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0006 applied');
  // 검증 — 기본 프로필 보유 유저 수 / 전체 유저 수
  const [{ seeded }] = await sql`
    select count(distinct user_id)::int as seeded
    from public.user_profiles where (options->>'isDefault') = 'true'`;
  const [{ total }] = await sql`select count(*)::int as total from public.profiles`;
  const [{ active }] = await sql`
    select count(*)::int as active from public.profiles where active_profile_id is not null`;
  console.log(`기본프로필 시드 유저: ${seeded} / 전체: ${total} / active 설정: ${active}`);
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
} finally {
  await sql.end();
}
