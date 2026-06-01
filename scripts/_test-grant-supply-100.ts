// 테스트 — 모든 활성 유저(profiles 전체)에게 슬롯별 보급상자 +100 지급.
// 사용자 요청(2026-06-01). 멱등 X — 실행할 때마다 추가됨. 1회용.
// 실행: bun run scripts/_test-grant-supply-100.ts
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
  const before = await sql<{ c: number }[]>`select count(*)::int as c from profiles`;
  console.log(`프로필 ${before[0]!.c}명에게 슬롯당 100상자 지급 시작…`);

  const r = await sql.unsafe(`
    INSERT INTO user_supply_boxes (user_id, slot, count)
    SELECT p.id, s.slot::slot, 100::bigint
    FROM profiles p
    CROSS JOIN (VALUES ('weapon'), ('armor'), ('accessory')) AS s(slot)
    ON CONFLICT (user_id, slot) DO UPDATE
      SET count = user_supply_boxes.count + 100
  `);
  console.log(`✓ 적용 완료 (${(r as unknown as { count: number }).count ?? '?'}행)`);

  const sample = await sql<{ user_id: string; slot: string; count: string }[]>`
    select user_id, slot, count::text from user_supply_boxes limit 6
  `;
  console.log('샘플:', sample);
} catch (e) {
  console.error('실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
