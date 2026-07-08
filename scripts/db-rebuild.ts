// ⚠ DESTRUCTIVE — DB 전체 재구축 (public 스키마 통째 drop 후 재생성).
// 사용: bun run scripts/db-rebuild.ts --confirm
// 적용 순서:
//   1) DROP SCHEMA public CASCADE / CREATE SCHEMA public
//   2) lib/db/migrations/*.sql + lib/db/manual/*.sql 를 **멀티패스**로 적용
//      - drizzle/manual 두 계열이 시간상 교차 의존(예: drizzle 0018~0020 guild_* → manual 0036 guilds)이라
//        단순 정렬순으론 깨진다. 파일은 모두 멱등(IF NOT EXISTS/DO $$)이므로, 실패한 파일만 다음 패스에서
//        재시도하면 의존성이 자동 해소된다(파일별 원자 트랜잭션이라 실패 시 부분 적용 없음).
//   3) seed-catalog (카탈로그 INSERT)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';
import postgres from 'postgres';

import { listManualFiles, recordMigration } from './_ledger';

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

type SqlFile = { label: string; path: string };

function statementsOf(path: string): string[] {
  const body = readFileSync(path, 'utf8');
  // Drizzle migrations은 `--> statement-breakpoint` 마커로 statement 구분.
  // 마커가 없는 manual SQL은 통째 한 statement로 실행.
  return body
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter((s) => s.length > 0);
}

/**
 * 파일 1개 적용 — statement별 autocommit(트랜잭션으로 감싸지 않음).
 * `ALTER TYPE ... ADD VALUE`는 트랜잭션 안에서 사용 제약에 걸리므로 단일 statement 단위로 실행해야 한다
 * (파일들이 그 전제로 작성됨). 멀티패스 재시도가 의존성/부분적용을 흡수(파일들은 멱등 IF NOT EXISTS).
 */
async function applyFile(sql: postgres.Sql, file: SqlFile): Promise<void> {
  for (const stmt of statementsOf(file.path)) await sql.unsafe(stmt);
}

// 어떤 SQL 파일도 추가하지 않고 '적용 스크립트가 선행 처리'하게 돼 있는 enum 값(0038 주석 참조).
// zone_region 타입 생성 후에야 성공하므로, 매 패스 시작에 시도하고 실패는 무시한다.
const PRE_ENUM = [
  "ALTER TYPE zone_region ADD VALUE IF NOT EXISTS 'kingdom'",
  "ALTER TYPE zone_region ADD VALUE IF NOT EXISTS 'angel'",
];
async function applyPreEnum(sql: postgres.Sql): Promise<void> {
  for (const s of PRE_ENUM) {
    try {
      await sql.unsafe(s);
    } catch {
      // zone_region 미생성(초기 패스) — 다음 패스에서 재시도.
    }
  }
}

function listSql(dir: string, tag: string): SqlFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ label: `${tag}/${f}`, path: join(dir, f) }));
}

async function main() {
  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  console.log('\n[1/3] DROP SCHEMA public CASCADE + CREATE SCHEMA public');
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  // Supabase 기본 권한 복원
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO postgres, service_role');

  console.log('\n[2/3] SQL 멀티패스 적용(의존성 자동 해소 — 멱등 가정)');
  const all: SqlFile[] = [...listSql(MIGRATIONS_DIR, 'migrations'), ...listSql(MANUAL_DIR, 'manual')];
  let pending = all;
  let pass = 0;
  while (pending.length > 0) {
    pass += 1;
    await applyPreEnum(sql); // zone_region kingdom/angel 선행(타입 생성 후 성공)
    const failed: SqlFile[] = [];
    let lastErr: unknown = null;
    for (const file of pending) {
      try {
        await applyFile(sql, file);
      } catch (e) {
        failed.push(file);
        lastErr = e;
      }
    }
    console.log(`  pass ${pass}: 적용 ${pending.length - failed.length} · 남음 ${failed.length}`);
    if (failed.length === pending.length) {
      // 진전 없음 → 의존성이 아닌 실제 SQL 오류. 멈추고 보고.
      console.error('  ❌ 진전 없는 파일:', failed.map((f) => f.label).join(', '));
      throw lastErr;
    }
    pending = failed;
  }

  // 원장 백필 — 방금 적용한 manual 파일 전체를 schema_migrations에 기록(0112가 패스 중 생성됨).
  console.log('\n[2.5] 마이그레이션 원장 백필(schema_migrations)');
  const manual = listManualFiles(MANUAL_DIR);
  for (const f of manual) await recordMigration(sql, f.filename, f.checksum);
  console.log(`  ${manual.length}개 기록`);

  console.log('\n[3/3] seed-catalog');
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
