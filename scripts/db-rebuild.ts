// ⚠ DESTRUCTIVE — DB 전체 재구축 (public 스키마 통째 drop 후 재생성).
// 사용: bun run scripts/db-rebuild.ts --confirm
// 적용 순서:
//   1) DROP SCHEMA public CASCADE / CREATE SCHEMA public
//   2) lib/db/migrations/*.sql 알파벳순 순차 적용
//   3) lib/db/manual/0001_onboarding_starter.sql (auth 트리거 + 기존 유저 백필)
//   4) lib/db/manual/0002_codex_max_enhance_reached_at.sql (멱등 백필)
//   5) seed-catalog (150종 INSERT)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

if (!process.argv.includes('--confirm')) {
  console.error('⚠ DESTRUCTIVE 작업. 진행하려면:');
  console.error('   bun run scripts/db-rebuild.ts --confirm');
  process.exit(1);
}

const url: string | undefined = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL/DIRECT_URL 필요 — .env.local 확인');
  process.exit(1);
}
const dbUrl: string = url;

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'lib', 'db', 'migrations');
const MANUAL_DIR = join(ROOT, 'lib', 'db', 'manual');

async function execFile(sql: postgres.Sql, label: string, path: string): Promise<void> {
  const body = readFileSync(path, 'utf8');
  // Drizzle migrations은 `--> statement-breakpoint` 마커로 statement 구분.
  // 마커가 없는 manual SQL은 통째 한 statement로 실행.
  const stmts = body
    .split(/-->\s*statement-breakpoint/)
    .map((s) => {
      // 각 청크에서 라인-시작 주석 줄만 제거하고 SQL 본문은 보존
      return s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
    })
    .filter((s) => s.length > 0);
  console.log(`  ${label}: ${stmts.length} statements`);
  for (const stmt of stmts) {
    await sql.unsafe(stmt);
  }
}

async function main() {
  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  console.log('\n[1/5] DROP SCHEMA public CASCADE + CREATE SCHEMA public');
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  // Supabase 기본 권한 복원
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO postgres, service_role');

  console.log('\n[2/5] Drizzle migrations 순차 적용');
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of migrations) {
    await execFile(sql, f, join(MIGRATIONS_DIR, f));
  }

  console.log('\n[3/5] lib/db/manual/0001_onboarding_starter.sql');
  await execFile(sql, '0001_onboarding_starter.sql', join(MANUAL_DIR, '0001_onboarding_starter.sql'));

  console.log('\n[4/5] lib/db/manual/0002_codex_max_enhance_reached_at.sql');
  await execFile(sql, '0002_codex_max_enhance_reached_at.sql', join(MANUAL_DIR, '0002_codex_max_enhance_reached_at.sql'));

  console.log('\n[5/5] seed-catalog');
  await sql.end();

  // seed-catalog는 별도 connection을 사용하는 독립 스크립트 → exec
  const { spawnSync } = await import('node:child_process');
  const res = spawnSync('bun', ['run', 'scripts/seed-catalog.ts'], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error('seed-catalog 실패');

  console.log('\n✅ DB 재구축 완료');
}

main().catch((e) => {
  console.error('\n❌ 실패:', e);
  process.exit(1);
});
