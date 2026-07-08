/**
 * 단일 SQL 파일을 운영 Supabase에 트랜잭션 안에서 적용.
 *
 * 사용:
 *   bun run scripts/apply-migration.ts lib/db/migrations/0008_push.sql
 *
 * 환경:
 *   DIRECT_URL = Supabase Session pooler(:5432) — Drizzle migrate와 동일 경로
 *
 * 안전성:
 *  - 단일 BEGIN/COMMIT으로 wrap → 중간 실패 시 자동 ROLLBACK
 *  - SQL 자체는 호출자 책임으로 멱등(IF NOT EXISTS / DO $$ EXCEPTION 등)으로 작성
 *  - 적용 후 잠깐 끊고 종료 (커넥션 풀 누수 방지)
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { config } from 'dotenv';
import postgres from 'postgres';

import { checksumOf, recordMigration } from './_ledger';

config({ path: '.env.local' });

const arg = process.argv[2];
if (!arg) {
  console.error('사용: bun run scripts/apply-migration.ts <path-to-sql>');
  process.exit(1);
}
const path = resolve(process.cwd(), arg);
if (!existsSync(path)) {
  console.error(`파일 없음: ${path}`);
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL 미설정 — .env.local 확인 (Supabase session pooler:5432)');
  process.exit(1);
}

const body = readFileSync(path, 'utf8');
console.log(`[apply] ${path} (${body.length} bytes)`);

const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

try {
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
  });
  console.log('[apply] OK — COMMIT 완료');

  // 마이그레이션 원장 기록 — 커밋과 분리(원장 테이블 부재 시 마이그레이션 자체를 롤백시키지 않도록).
  try {
    await recordMigration(sql, basename(path), checksumOf(body));
    console.log('[apply] 원장 기록(schema_migrations)');
  } catch (e) {
    console.warn('[apply] ⚠ 원장 미기록 — schema_migrations 없음? 0112를 먼저 적용하세요:', (e as Error).message);
  }
} catch (e) {
  console.error('[apply] FAIL — 자동 ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
