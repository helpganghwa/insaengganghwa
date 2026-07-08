/**
 * 마이그레이션 원장(schema_migrations) 공용 헬퍼 — apply-migration·db-rebuild·backfill·status 공유.
 * "이 DB에 어떤 manual SQL이 적용됐나 + 적용 후 파일이 바뀌었나(drift)"를 추적한다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** postgres.js 인스턴스/트랜잭션 공통(둘 다 .unsafe 보유) — postgres 타입 import 없이 구조적 수용. */
export type SqlRunner = { unsafe(query: string, params?: unknown[]): Promise<unknown> };

export function checksumOf(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export type ManualFile = { filename: string; path: string; checksum: string };

/** lib/db/manual/*.sql 정렬 목록(파일명 + sha256). */
export function listManualFiles(manualDir: string): ManualFile[] {
  return readdirSync(manualDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => {
      const path = join(manualDir, f);
      return { filename: f, path, checksum: checksumOf(readFileSync(path, 'utf8')) };
    });
}

/** 원장에 1건 기록(재적용 시 checksum/applied_at 갱신). schema_migrations 존재 전제. */
export async function recordMigration(
  sqlx: SqlRunner,
  filename: string,
  checksum: string | null,
): Promise<void> {
  await sqlx.unsafe(
    `insert into schema_migrations (filename, checksum, applied_at) values ($1, $2, now())
     on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`,
    [filename, checksum],
  );
}
