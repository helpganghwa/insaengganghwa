// 0026 user_equipment 랭킹 인덱스. 추가형·멱등. 실행: bun run scripts/_apply-0026.ts
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('lib/db/manual/0026_ue_rank_index.sql', 'utf8'));
  console.log('✓ 0026 적용 완료');
  const idx = await sql`select indexname, indexdef from pg_indexes where tablename='user_equipment' and indexname='ue_catalog_rank_idx'`;
  console.log('인덱스:', idx.length ? idx[0].indexname : '(없음!)');
  // EXPLAIN으로 셀프조인이 인덱스를 쓰는지 확인.
  const [u] = await sql`select user_id from user_equipment limit 1`;
  if (u) {
    const ex = await sql.unsafe(`explain select uc.catalog_item_id from user_equipment uc
      where uc.user_id='${u.user_id}'::uuid and uc.max_enhance_level>0
      and not exists (select 1 from user_equipment o where o.catalog_item_id=uc.catalog_item_id
        and (o.max_enhance_level>uc.max_enhance_level
          or (o.max_enhance_level=uc.max_enhance_level and o.max_enhance_reached_at<uc.max_enhance_reached_at)
          or (o.max_enhance_level=uc.max_enhance_level and o.max_enhance_reached_at=uc.max_enhance_reached_at and o.user_id<uc.user_id)))`);
    console.log('EXPLAIN:');
    for (const r of ex) console.log('  ', (r as Record<string, string>)['QUERY PLAN']);
  }
} catch (e) {
  console.error('✗', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
