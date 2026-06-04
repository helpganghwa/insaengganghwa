// 0013 profile_report_reason ENUM에 nickname/avatar/bug_abuse 추가. 멱등.
// 실행: bun run scripts/_apply-0013.ts
//
// ⚠ ALTER TYPE ADD VALUE는 단일 statement당 한 번씩 실행해야 하며(트랜잭션 블록 제약),
//   postgres.js unsafe()는 extended protocol로 한 묶음 실행 → 분리 호출.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL/DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const VALUES = ['nickname', 'avatar', 'bug_abuse'] as const;

try {
  for (const v of VALUES) {
    await sql.unsafe(`ALTER TYPE profile_report_reason ADD VALUE IF NOT EXISTS '${v}'`);
    console.log(`✓ ADD VALUE '${v}'`);
  }
  // 검증.
  const rows = await sql<{ enumlabel: string }[]>`
    select enumlabel
    from pg_enum
    where enumtypid = 'profile_report_reason'::regtype
    order by enumsortorder
  `;
  console.log('현재 enum 라벨:', rows.map((r) => r.enumlabel).join(', '));
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
