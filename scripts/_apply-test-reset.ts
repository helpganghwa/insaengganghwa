// 실운영 테스트용 DB 초기화(일회성) — DIRECT_URL(session pooler).
// 실행: bun run scripts/_apply-test-reset.ts
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
const ddl = readFileSync('scripts/_test-reset.sql', 'utf8');

const USERDATA_SAMPLE = [
  'profiles',
  'user_profiles',
  'user_supply_boxes',
  'raids',
  'user_checkin_state',
  'enhancement_jobs',
  'equipment_instances',
  'mailbox',
  'iap_orders',
  'push_subscriptions',
  'admin_actions',
];
const PRESERVE = ['catalog_items', 'probability_snapshots', 'system_mode'];

try {
  console.log('▶ truncate 실행 중…');
  await sql.unsafe(ddl);
  console.log('✓ truncate done\n');

  console.log('── 비움 검증 (=0 기대) ──');
  for (const t of USERDATA_SAMPLE) {
    const [{ count }] = await sql.unsafe(`select count(*)::int as count from public.${t}`);
    console.log(`  ${t.padEnd(28)} ${count}`);
  }
  const [{ count: authCount }] = await sql.unsafe(
    `select count(*)::int as count from auth.users`,
  );
  console.log(`  ${'auth.users'.padEnd(28)} ${authCount}`);

  console.log('\n── 보존 검증 (>0 기대) ──');
  for (const t of PRESERVE) {
    const [{ count }] = await sql.unsafe(`select count(*)::int as count from public.${t}`);
    console.log(`  ${t.padEnd(28)} ${count}`);
  }
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
