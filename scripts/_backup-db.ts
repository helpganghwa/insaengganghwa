// 전 테이블 JSON 논리 백업(pg_dump 불필요). 출력: <경로> 인자 또는 ~/insaeng-backups/.
// 실행: bun run scripts/_backup-db.ts [출력파일경로]
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
config({ path: '.env.local' });

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(homedir(), 'insaeng-backups');
mkdirSync(outDir, { recursive: true });
const outFile = process.argv[2] ?? join(outDir, `cbt-pre-reset-${ts}.json`);

try {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`;
  const dump: Record<string, unknown[]> = {};
  let total = 0;
  for (const { table_name: t } of tables) {
    const rows = await sql`select * from ${sql(t)}`;
    dump[t] = rows;
    total += rows.length;
  }
  writeFileSync(outFile, JSON.stringify({ at: ts, tables: Object.keys(dump).length, total, dump }));
  const { size } = await import('node:fs').then((m) => m.statSync(outFile));
  console.log(`✓ 백업 완료: ${outFile}`);
  console.log(`  테이블 ${Object.keys(dump).length} · 총 ${total} rows · ${(size / 1024 / 1024).toFixed(2)} MB`);
} catch (e) {
  console.error('✗ 백업 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
