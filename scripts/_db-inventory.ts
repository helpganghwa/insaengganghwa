// 공개 스키마 테이블 인벤토리 — user 관련 컬럼 보유 여부 출력(초기화 대상 식별용). 읽기 전용.
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });

type Row = { table_name: string; user_cols: string | null; rows: number };
const rows = await sql<Row[]>`
  select t.table_name,
    (select string_agg(c.column_name, ',') from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t.table_name
         and c.column_name like '%user_id') as user_cols
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by t.table_name`;

for (const r of rows) {
  const [c] = await sql.unsafe(`select count(*)::int n from "${r.table_name}"`);
  console.log(`${(c.n + '').padStart(6)}  ${r.table_name}${r.user_cols ? '  ['+r.user_cols+']' : ''}`);
}
await sql.end();
