import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { openSupplyBoxes } from '@/lib/game/supply/open';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const SLOT = 'accessory' as const;

/**
 * openSupplyBoxes DB 통합(§5.4) — 가챠 트랜잭션 무결성 회귀 방지.
 * pool은 id 오름차순 고정이라 rng 주입(() => index)으로 특정 카탈로그를 결정적으로 뽑는다.
 * 검증: NO_BOX 가드 · 신규 획득(도감 해금+박스 차감+로그) · 중복→자동 초월(진행도 임계).
 * 공유 스테이징 DB fixture는 afterEach에서 박스 복원 + 생성물 정리.
 */
describe.skipIf(skip)('openSupplyBoxes — DB 통합', () => {
  const involved = new Set<number>();
  let priorBox: bigint | null = null;

  async function orderedPool(): Promise<number[]> {
    const rows = (await testDb.execute(sql`
      select id from catalog_items where slot = ${SLOT}::slot and active order by id`)) as unknown as { id: number }[];
    return rows.map((r) => Number(r.id));
  }
  /** 유저 미보유 + 미사용(involved 제외) 카탈로그와 pool 내 인덱스. */
  async function unownedCatalog(): Promise<{ id: number; index: number }> {
    const pool = await orderedPool();
    for (let i = 0; i < pool.length; i++) {
      const cid = pool[i]!;
      if (involved.has(cid)) continue;
      const owned = (await testDb.execute(sql`
        select 1 from user_equipment where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${cid}`)) as unknown as unknown[];
      if (owned.length === 0) return { id: cid, index: i };
    }
    throw new Error('미보유 accessory 카탈로그 없음 — 테스트 계정 정리 필요');
  }
  async function setBox(count: number): Promise<void> {
    const cur = (await testDb.execute(sql`
      select count::text c from user_supply_boxes
      where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and slot=${SLOT}::slot`)) as unknown as { c: string }[];
    priorBox = cur[0] ? BigInt(cur[0].c) : null;
    await testDb.execute(sql`
      insert into user_supply_boxes (user_id, server_id, slot, count)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${SLOT}::slot, ${count}::bigint)
      on conflict (user_id, server_id, slot) do update set count = ${count}::bigint`);
  }

  afterEach(async () => {
    try {
      if (priorBox === null) {
        await testDb.execute(sql`delete from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and slot=${SLOT}::slot`);
      } else {
        await testDb.execute(sql`update user_supply_boxes set count=${priorBox.toString()}::bigint where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and slot=${SLOT}::slot`);
      }
    } catch {}
    for (const cid of involved) {
      try { await testDb.execute(sql`delete from supply_open_logs where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${cid}`); } catch {}
      try { await testDb.execute(sql`delete from transcend_logs where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${cid}`); } catch {}
      try { await testDb.execute(sql`delete from user_equipment where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${cid}`); } catch {}
    }
    involved.clear();
    priorBox = null;
  });

  afterAll(async () => {
    await endTestDb();
  });

  it('NO_BOX: 박스 부족 시 거부', async () => {
    await setBox(0);
    await expect(
      openSupplyBoxes({ userId: TEST_USER_ID, serverId: SERVER_ID, slot: SLOT, count: 1 }),
    ).rejects.toMatchObject({ code: 'NO_BOX' });
  });

  it('신규 획득: 미보유 → 도감 해금 + 박스 1 차감 + 로그', async () => {
    const { id, index } = await unownedCatalog();
    involved.add(id);
    await setBox(1);

    const res = await openSupplyBoxes({
      userId: TEST_USER_ID, serverId: SERVER_ID, slot: SLOT, count: 1, rng: () => index,
    });
    expect(res).toHaveLength(1);
    expect(res[0]?.catalogItemId).toBe(id);
    expect(res[0]?.isNew).toBe(true);
    expect(res[0]?.transcended).toBe(0);
    expect(res[0]?.transcendLevel).toBe(0);

    const box = (await testDb.execute(sql`select count::text c from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and slot=${SLOT}::slot`)) as unknown as { c: string }[];
    expect(box[0]?.c).toBe('0'); // 1 → 0
    const eq = (await testDb.execute(sql`select 1 from user_equipment where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${id}`)) as unknown as unknown[];
    expect(eq.length).toBe(1);
    const logs = (await testDb.execute(sql`select is_new from supply_open_logs where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${id}`)) as unknown as { is_new: boolean }[];
    expect(logs.length).toBe(1);
    expect(logs[0]?.is_new).toBe(true);
  });

  it('중복 → 자동 초월 T0→T1 (진행도 임계 1)', async () => {
    const { id, index } = await unownedCatalog();
    involved.add(id);
    await testDb.execute(sql`
      insert into user_equipment (user_id, server_id, catalog_item_id, transcend_level, transcend_progress)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${id}, 0, 0)`);
    await setBox(1);

    const res = await openSupplyBoxes({
      userId: TEST_USER_ID, serverId: SERVER_ID, slot: SLOT, count: 1, rng: () => index,
    });
    expect(res[0]?.isNew).toBe(false);
    expect(res[0]?.transcended).toBe(1);
    expect(res[0]?.transcendLevel).toBe(1);
    expect(res[0]?.transcendProgress).toBe(0);

    const eq = (await testDb.execute(sql`select transcend_level tl, transcend_progress tp from user_equipment where user_id=${TEST_USER_ID}::uuid and catalog_item_id=${id}`)) as unknown as { tl: number; tp: number }[];
    expect(Number(eq[0]?.tl)).toBe(1);
    expect(Number(eq[0]?.tp)).toBe(0);
  });
});
