/**
 * 마이그레이션 상태/드리프트 점검 — "이 DB가 최신인가 + 적용 후 편집된 파일이 있나".
 * manual 파일 목록 ↔ schema_migrations 원장을 대조.
 *   - pending  : 파일은 있는데 원장에 없음(미적용 의심)
 *   - drifted  : 원장 checksum ≠ 현재 파일 checksum(적용 후 파일 편집)
 *   - orphaned : 원장에만 있고 파일 없음(파일 삭제/이름변경)
 * pending·drifted가 있으면 exit 1(배포 전/CI 게이트로 사용 가능).
 *
 * 사용: bun run scripts/migration-status.ts            # DIRECT_URL(기본=staging)
 *       bun run scripts/migration-status.ts PROD_DATABASE_URL
 */
import { join } from 'node:path';

import { config } from 'dotenv';
import postgres from 'postgres';

import { listManualFiles } from './_ledger';

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
    console.error(`[status:${envVar}] ❌ schema_migrations 없음 — ledger 미도입(0112 미적용)`);
    process.exit(2);
  }

  const files = listManualFiles(MANUAL_DIR);
  const ledger = (await sql`select filename, checksum from schema_migrations`) as unknown as {
    filename: string;
    checksum: string | null;
  }[];
  const ledgerMap = new Map(ledger.map((r) => [r.filename, r.checksum]));
  const fileSet = new Set(files.map((f) => f.filename));

  const pending = files.filter((f) => !ledgerMap.has(f.filename)).map((f) => f.filename);
  const drifted = files
    .filter((f) => {
      const c = ledgerMap.get(f.filename);
      return ledgerMap.has(f.filename) && c != null && c !== f.checksum;
    })
    .map((f) => f.filename);
  const orphaned = ledger.filter((r) => !fileSet.has(r.filename)).map((r) => r.filename);

  console.log(`[status:${envVar}] manual 파일 ${files.length} · 원장 ${ledger.length}`);
  console.log(`  pending(미적용) ${pending.length}${pending.length ? ': ' + pending.join(', ') : ''}`);
  console.log(`  drifted(적용 후 편집) ${drifted.length}${drifted.length ? ': ' + drifted.join(', ') : ''}`);
  console.log(`  orphaned(원장만) ${orphaned.length}${orphaned.length ? ': ' + orphaned.join(', ') : ''}`);

  if (pending.length || drifted.length) {
    console.error('❌ DB가 최신이 아니거나 적용 후 편집된 파일이 있습니다.');
    process.exit(1);
  }
  console.log('✅ 최신·정합(pending·drift 없음)');
} finally {
  await sql.end({ timeout: 5 });
}
