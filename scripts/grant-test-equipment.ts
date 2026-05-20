// 테스트 유저 dfebdfe7-31ae-4923-88df-493f4f3b4252에게 +99강 T10 장비 2개 지급.
// 무기 + 방어구 슬롯 각 1개씩. 미장착·미잠금 상태. 카탈로그는 슬롯별 무작위 1개.
//
// 실행: bun run scripts/grant-test-equipment.ts
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const DIRECT = process.env.DIRECT_URL;
if (!DIRECT) {
  console.error('DIRECT_URL 필요 — .env.local');
  process.exit(1);
}
const USER_ID = 'dfebdfe7-31ae-4923-88df-493f4f3b4252';

const sql = postgres(DIRECT, { prepare: false, max: 1, idle_timeout: 10 });
try {
  for (const slot of ['weapon', 'armor'] as const) {
    const [c] = (await sql`
      select id, code, name from catalog_items
      where slot = ${slot} and active = true
      order by random() limit 1
    `) as unknown as { id: number; code: string; name: string }[];
    if (!c) {
      console.error(`  ${slot}: 활성 카탈로그 없음`);
      continue;
    }
    const [row] = await sql`
      insert into equipment_instances (user_id, catalog_item_id, enhance_level, transcend_level, equipped_slot, is_locked)
      values (${USER_ID}::uuid, ${c.id}, 99, 10, null, false)
      returning id::text id
    `;
    console.log(`  ✓ ${slot} +99 T10  cat=${c.code}(${c.name}) instance=${row?.id}`);
    // user_codex도 갱신 — 최고 강화 99 기록(챔피언 판정용).
    await sql`
      insert into user_codex (user_id, catalog_item_id, max_enhance_level, max_enhance_reached_at, first_acquired_at)
      values (${USER_ID}::uuid, ${c.id}, 99, now(), now())
      on conflict (user_id, catalog_item_id) do update
        set max_enhance_level = greatest(user_codex.max_enhance_level, 99),
            max_enhance_reached_at = case
              when user_codex.max_enhance_level < 99 then now()
              else user_codex.max_enhance_reached_at
            end
    `;
  }
  console.log('[grant] 완료.');
} finally {
  await sql.end();
}
