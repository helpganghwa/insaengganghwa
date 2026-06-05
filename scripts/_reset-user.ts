// 특정 유저를 신규(튜토리얼 1단계) 상태로 — 장비/강화/보급 진행 삭제, 보급상자 재충전, tutorial_step=1.
// 닉네임·아바타 유지. 실행: bun run scripts/_reset-user.ts <user_uuid>
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const uid = process.argv[2];
if (!uid) {
  console.error('usage: bun run scripts/_reset-user.ts <user_uuid>');
  process.exit(1);
}
const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const [p] = await sql<{ nickname: string }[]>`select nickname from profiles where id = ${uid}`;
  if (!p) {
    console.error('✗ 프로필 없음:', uid);
    process.exit(1);
  }

  await sql.begin(async (tx) => {
    // FK 순서: user_equipment 참조 테이블 먼저.
    await tx`delete from enhancement_jobs where user_id = ${uid}`;
    await tx`delete from gem_time_reductions where user_id = ${uid}`;
    await tx`delete from enhancement_logs where user_id = ${uid}`;
    await tx`delete from transcend_logs where user_id = ${uid}`;
    await tx`delete from supply_open_logs where user_id = ${uid}`;
    await tx`delete from user_equipment where user_id = ${uid}`;
    await tx`delete from battlepass_state where user_id = ${uid}`;
    await tx`delete from user_checkin_state where user_id = ${uid}`;

    // 보급상자 재충전(슬롯별 100).
    await tx`delete from user_supply_boxes where user_id = ${uid}`;
    await tx.unsafe(
      `insert into user_supply_boxes (user_id, slot, count)
       select '${uid}'::uuid, sl::slot, 100 from unnest(array['weapon','armor','accessory']) as sl`,
    );

    await tx`update profiles set tutorial_step = 1, updated_at = now() where id = ${uid}`;
  });

  const [s] = await sql<{ eq: number; boxes: number; ts: number }[]>`
    select (select count(*) from user_equipment where user_id = ${uid})::int as eq,
           (select coalesce(sum(count),0) from user_supply_boxes where user_id = ${uid})::int as boxes,
           (select tutorial_step from profiles where id = ${uid}) as ts`;
  console.log(`✓ ${p.nickname} 리셋 — 장비 ${s.eq} · 보급상자 ${s.boxes} · tutorial_step ${s.ts} (→ open 단계)`);
} catch (e) {
  console.error('✗ 실패(롤백):', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
