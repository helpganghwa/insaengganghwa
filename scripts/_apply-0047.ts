// 0047 world_chronicle.full_narrative→headline + 기존 시드행 삭제(새 포맷 재시드 위해). 멱등.
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const sql = postgres(url, { prepare: false, max: 1 });
try {
  // 컬럼명 이미 headline이면 rename 스킵.
  const [h] = await sql`select 1 from information_schema.columns where table_name='world_chronicle' and column_name='headline'`;
  if (!h) await sql.unsafe(readFileSync('lib/db/manual/0047_chronicle_headline.sql', 'utf8'));
  // 구 포맷 시드행 제거(headline 자리에 긴 서사가 들어가 있던 것) — 재시드 예정.
  const del = await sql`delete from world_chronicle`;
  console.log('✓ 0047 — headline 컬럼:', !!h ? '이미있음' : '생성', '· 기존행 삭제:', del.count);
} catch (e) { console.error('✗', (e as Error).message); process.exit(1); }
finally { await sql.end(); }
