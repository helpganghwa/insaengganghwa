// 0024 장비 모델 재설계 — equipment_instances+user_codex → user_equipment. 1회 적용(원자 트랜잭션).
// 실행: bun run scripts/_apply-0024.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const ddl = readFileSync('lib/db/manual/0024_equipment_model_redesign.sql', 'utf8');
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.unsafe(`begin;\n${ddl}\ncommit;`);
  console.log('✓ 0024 적용 완료');

  const [t] = await sql<{ ue: number; jobs: number; old_inst: number; old_codex: number }[]>`
    select
      (select count(*) from public.user_equipment)::int as ue,
      (select count(*) from public.enhancement_jobs where status='running')::int as jobs,
      (select count(*) from information_schema.tables where table_schema='public' and table_name='equipment_instances')::int as old_inst,
      (select count(*) from information_schema.tables where table_schema='public' and table_name='user_codex')::int as old_codex
  `;
  console.log(
    `user_equipment ${t.ue}행 · running job ${t.jobs}건 · 구 테이블 잔존(instances=${t.old_inst}, codex=${t.old_codex} — 0이어야 정상)`,
  );
  const [c] = await sql<{ col: number }[]>`
    select count(*)::int as col from information_schema.columns
    where table_schema='public' and table_name='enhancement_jobs' and column_name='user_equipment_id'
  `;
  console.log(`enhancement_jobs.user_equipment_id 컬럼 존재: ${c.col === 1}`);
} catch (e) {
  console.error('✗ 실패(롤백됨):', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
