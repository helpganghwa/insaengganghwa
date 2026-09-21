import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { pgErrorCode } from '@/lib/db/errors';

import { endTestDb, sql, testDb } from '../db';

/**
 * 알림 묶음은 서버마다 따로 쌓인다(0206, 2026-09-21 ⑰).
 * 종전에는 (user_id, category)가 PK라 묶음 윈도 중 서버를 옮기면 두 서버 항목이 한 행에 섞이고,
 * 중복 제거 키가 (slot, slot_lane)뿐이라 같은 슬롯이면 앞 서버 항목이 조용히 지워졌다.
 */
const USER = process.env.TEST_USER_ID ?? '';

const clean = async () => {
  await testDb.execute(sql`delete from push_pending where user_id = ${USER}::uuid`);
};

/** lib/push/pending.ts의 적재문과 같은 모양 — 스키마 계약만 확인한다. */
async function put(serverId: number, slot: string, lane: number) {
  const item = JSON.stringify({ slot, slotLane: lane, fromLevel: 1, toLevel: 2, outcome: 'success' });
  await testDb.execute(sql`
    insert into push_pending (user_id, category, server_id, items, first_at)
    values (${USER}::uuid, 'enhance'::push_category, ${serverId}, jsonb_build_array(${item}::jsonb), now())
    on conflict (user_id, category, server_id) do update
      set items = coalesce(
        (select jsonb_agg(elem) from jsonb_array_elements(push_pending.items) elem
          where not (elem->>'slot' = ${slot} and (elem->>'slotLane')::int = ${lane})),
        '[]'::jsonb
      ) || jsonb_build_array(${item}::jsonb),
      updated_at = now()
  `);
}

const rows = async () =>
  (await testDb.execute(sql`
    select server_id, jsonb_array_length(items)::int as n from push_pending
     where user_id = ${USER}::uuid and category = 'enhance'::push_category
     order by server_id
  `)) as unknown as { server_id: number; n: number }[];

describe.skipIf(!USER)('알림 묶음 — 서버별로 따로 쌓인다', () => {
  afterEach(clean);
  afterAll(async () => {
    await clean();
    await endTestDb();
  });

  it('서버가 다르면 같은 슬롯이어도 서로 지우지 않는다', async () => {
    await put(1, 'weapon', 1);
    await put(2, 'weapon', 1); // 종전에는 이 한 줄이 1서버 항목을 덮어썼다
    expect(await rows()).toEqual([
      { server_id: 1, n: 1 },
      { server_id: 2, n: 1 },
    ]);
  });

  it('같은 서버 안에서는 종전처럼 같은 슬롯을 교체한다 — 개수가 늘지 않는다', async () => {
    await put(1, 'weapon', 1);
    await put(1, 'weapon', 1);
    await put(1, 'armor', 1);
    expect(await rows()).toEqual([{ server_id: 1, n: 2 }]);
  });

  it('server_id는 비울 수 없다 — 키의 일부라 null이면 묶음이 다시 섞인다', async () => {
    const bad = await testDb
      .execute(sql`
        insert into push_pending (user_id, category, server_id, items)
        values (${USER}::uuid, 'enhance'::push_category, null, '[]'::jsonb)
      `)
      .then(() => null)
      .catch((e: unknown) => pgErrorCode(e));
    expect(bad).toBe('23502'); // not_null_violation
  });
});
