// 0023 user_codex 초월 lifetime 컬럼(max_transcend_level / _reached_at) 추가 + 백필. 멱등.
// 실행: bun run scripts/_apply-0023.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const ddl = readFileSync('lib/db/manual/0023_codex_max_transcend.sql', 'utf8');
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.unsafe(ddl);
  console.log('✓ 0023 적용 완료');

  // 검증 1) 컬럼 존재.
  const cols = await sql<{ column_name: string; data_type: string }[]>`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'user_codex'
      and column_name in ('max_transcend_level', 'max_transcend_reached_at')
    order by column_name
  `;
  console.log('컬럼:', cols.map((c) => `${c.column_name}(${c.data_type})`).join(', '));

  // 검증 2) 백필 결과 요약.
  const [agg] = await sql<{ rows: number; transcended: number; max_t: number }[]>`
    select count(*)::int as rows,
           count(*) filter (where max_transcend_level > 0)::int as transcended,
           coalesce(max(max_transcend_level), 0)::int as max_t
    from public.user_codex
  `;
  console.log(`도감 행 ${agg.rows}개 · 초월 기록 보유 ${agg.transcended}개 · 최고 초월 T${agg.max_t}`);
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
