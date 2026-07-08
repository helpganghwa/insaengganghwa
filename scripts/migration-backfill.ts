/**
 * 마이그레이션 원장 백필 — 이미 provision된 DB(prod/staging)에 기존 manual 파일 전체를 원장에 등록.
 * ⚠ 대상 DB에 **모든 manual 파일이 이미 적용돼 있다는 전제**(그렇지 않으면 미적용분을 적용됨으로 오기록).
 *
 * 사용: bun run scripts/migration-backfill.ts            # DIRECT_URL(기본=staging)
 *       bun run scripts/migration-backfill.ts PROD_DATABASE_URL
 */
import { join } from 'node:path';

import { config } from 'dotenv';
import postgres from 'postgres';

import { listManualFiles, recordMigration } from './_ledger';

config({ path: '.env.local' });

const envVar = process.argv[2] ?? 'DIRECT_URL';
const url = process.env[envVar];
if (!url) {
  console.error(`${envVar} 미설정 — .env.local 확인`);
  process.exit(1);
}

const MANUAL_DIR = join(process.cwd(), 'lib', 'db', 'manual');
const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

try {
  const reg = (await sql`select to_regclass('public.schema_migrations') is not null as ok`) as unknown as {
    ok: boolean;
  }[];
  if (!reg[0]?.ok) {
    console.error(
      'schema_migrations 없음 — 먼저 0112 적용: bun run db:apply lib/db/manual/0112_schema_migrations.sql',
    );
    process.exit(1);
  }
  const files = listManualFiles(MANUAL_DIR);
  for (const f of files) await recordMigration(sql, f.filename, f.checksum);
  console.log(`[backfill:${envVar}] manual ${files.length}개를 원장에 기록 완료`);
} finally {
  await sql.end({ timeout: 5 });
}
