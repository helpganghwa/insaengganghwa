// 0010 초기 닉네임 '대장장이' + 6자리 난수 형식 적용. 멱등.
// 실행: bun run scripts/_apply-0010.ts
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const ddl = readFileSync('lib/db/manual/0010_blacksmith_nickname.sql', 'utf8');

try {
  await sql.unsafe(ddl);
  console.log('✓ 0010 applied');
  const samples = (await sql`
    select public.generate_korean_nickname() as n
    from generate_series(1, 5)
  `) as unknown as Array<{ n: string }>;
  console.log('  샘플 닉네임:');
  for (const { n } of samples) {
    console.log(`    "${n}" (${n.length}자)`);
  }
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
