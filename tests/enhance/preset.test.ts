import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { applyPreset, fillPresetFromCurrent, getEnhancePresets, renamePreset, setPresetLane } from '@/lib/game/enhance/preset';
import { PresetError } from '@/lib/game/enhance/preset';
import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

/**
 * 강화 프리셋 DB 통합(0246) — 저장(칸·이름·채우기)과 적용(취소→등록 한 트랜잭션)의 회귀 방지.
 * 공유 스테이징 DB fixture는 afterEach에서 정리: 만든 장비·잡·프리셋 행.
 * 테스트 장비는 이 유저가 미보유인 무기 카탈로그 둘을 골라 만든다(무기 lane 두 칸이 비어 있어야 한다).
 */
describe.skipIf(skip)('강화 프리셋 — DB 통합', () => {
  const equipIds: bigint[] = [];

  /** 진행 중 잡이 하나도 없는 부위(두 칸 다 빈 곳) — 없으면 null(다른 테스트 fixture가 차지한 상태, 적용 테스트는 건너뜀). */
  async function freeSlot(): Promise<'weapon' | 'armor' | 'accessory' | null> {
    const r = (await testDb.execute(sql`
      select s.slot from (values ('weapon'), ('armor'), ('accessory')) s(slot)
       where not exists (select 1 from enhancement_jobs j where j.user_id = ${TEST_USER_ID}::uuid and j.server_id = ${SERVER_ID} and j.status = 'running' and j.slot::text = s.slot)
       order by 1 limit 1`)) as unknown as { slot: 'weapon' | 'armor' | 'accessory' }[];
    return r[0]?.slot ?? null;
  }
  async function makeWeapon(level: number, slot: 'weapon' | 'armor' | 'accessory' = 'weapon'): Promise<bigint> {
    const r = (await testDb.execute(sql`
      insert into user_equipment (user_id, server_id, catalog_item_id, enhance_level, transcend_level)
      select ${TEST_USER_ID}::uuid, ${SERVER_ID}, c.id, ${level}, 0 from catalog_items c
       where c.active and c.slot::text = ${slot}
         and not exists (select 1 from user_equipment u where u.user_id = ${TEST_USER_ID}::uuid and u.server_id = ${SERVER_ID} and u.catalog_item_id = c.id)
       order by c.id limit 1
      returning id::text id`)) as unknown as { id: string }[];
    const id = BigInt(r[0]!.id);
    equipIds.push(id);
    return id;
  }
  async function runningOf(equipId: bigint): Promise<{ id: string; lane: number } | null> {
    const r = (await testDb.execute(sql`
      select id::text id, slot_lane lane from enhancement_jobs where user_equipment_id = ${equipId.toString()}::bigint and status = 'running'`)) as unknown as { id: string; lane: number }[];
    return r[0] ?? null;
  }

  afterEach(async () => {
    await testDb.execute(sql`delete from enhance_presets where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    for (const id of equipIds) {
      await testDb.execute(sql`delete from enhancement_jobs where user_equipment_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from user_equipment where id = ${id.toString()}::bigint`);
    }
    equipIds.length = 0;
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('getEnhancePresets — 행이 없어도 3개(빈 이름·빈 칸)', async () => {
    const ps = await getEnhancePresets(TEST_USER_ID, SERVER_ID);
    expect(ps.map((p) => p.presetNo)).toEqual([1, 2, 3]);
    expect(ps[0]!.lanes).toEqual({});
  });

  it('setPresetLane — 내 장비·같은 부위만, 다른 부위는 SLOT_MISMATCH, keep은 키를 지운다', async () => {
    const w = await makeWeapon(3);
    const p = await setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'weapon:1', { kind: 'item', equipmentId: w.toString() });
    expect(p.lanes['weapon:1']).toEqual({ kind: 'item', equipmentId: w.toString() });
    await expect(setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'armor:1', { kind: 'item', equipmentId: w.toString() })).rejects.toMatchObject({ code: 'SLOT_MISMATCH' });
    await expect(setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'weapon:1', { kind: 'item', equipmentId: '999999999999' })).rejects.toMatchObject({ code: 'EQUIPMENT_NOT_FOUND' });
    const p2 = await setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'weapon:1', { kind: 'keep' });
    expect(p2.lanes['weapon:1']).toBeUndefined();
    const p3 = await setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'armor:2', { kind: 'empty' });
    expect(p3.lanes['armor:2']).toEqual({ kind: 'empty' });
  });

  it('setPresetLane — 같은 장비를 다른 칸에 고르면 먼저 있던 칸 지정이 지워진다', async () => {
    const w = await makeWeapon(2);
    await setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'weapon:1', { kind: 'item', equipmentId: w.toString() });
    const p = await setPresetLane(TEST_USER_ID, SERVER_ID, 1, 'weapon:2', { kind: 'item', equipmentId: w.toString() });
    expect(p.lanes['weapon:1']).toBeUndefined();
    expect(p.lanes['weapon:2']).toEqual({ kind: 'item', equipmentId: w.toString() });
  });

  it('renamePreset — 8자 절단·공백 정리', async () => {
    const p = await renamePreset(TEST_USER_ID, SERVER_ID, 2, '  밤에 올리는 고강 세트 ');
    expect(p.name).toBe('밤에 올리는 고'); // 공백 포함 8자
    expect((await getEnhancePresets(TEST_USER_ID, SERVER_ID))[1]!.name).toBe('밤에 올리는 고');
  });

  it('applyPreset — 바뀌는 칸이 없으면 NOTHING_TO_APPLY', async () => {
    await expect(applyPreset(TEST_USER_ID, SERVER_ID, 3)).rejects.toBeInstanceOf(PresetError);
  });

  it('applyPreset — 빈 칸 등록(queue) → 다른 장비로 교체(swap, 기존 잡 취소) → 비우기(clear)', async () => {
    const slot = await freeSlot();
    if (!slot) {
      console.warn('[preset.test] 빈 부위가 없어 적용 테스트 건너뜀');
      return;
    }
    const L1 = `${slot}:1` as const;
    const L2 = `${slot}:2` as const;
    const a = await makeWeapon(5, slot);
    const b = await makeWeapon(7, slot);
    // ① a를 1칸에 등록
    await setPresetLane(TEST_USER_ID, SERVER_ID, 1, L1, { kind: 'item', equipmentId: a.toString() });
    const r1 = await applyPreset(TEST_USER_ID, SERVER_ID, 1);
    expect(r1).toMatchObject({ queued: 1, swapped: 0, cleared: 0, cancelled: 0 });
    const jobA = await runningOf(a);
    expect(jobA?.lane).toBe(1);
    // ② 같은 프리셋 다시 적용 → 바뀌는 칸 없음
    await expect(applyPreset(TEST_USER_ID, SERVER_ID, 1)).rejects.toMatchObject({ code: 'NOTHING_TO_APPLY' });
    // ③ weapon:1을 b로 교체 — a 잡 취소, b 잡이 lane 1
    await setPresetLane(TEST_USER_ID, SERVER_ID, 1, L1, { kind: 'item', equipmentId: b.toString() });
    const r2 = await applyPreset(TEST_USER_ID, SERVER_ID, 1);
    expect(r2).toMatchObject({ queued: 0, swapped: 1, cancelled: 1 });
    expect(await runningOf(a)).toBeNull();
    expect((await runningOf(b))?.lane).toBe(1);
    const cancelled = (await testDb.execute(sql`select status::text s from enhancement_jobs where id = ${jobA!.id}::bigint`)) as unknown as { s: string }[];
    expect(cancelled[0]?.s).toBe('cancelled');
    // ④ b를 weapon:2로 옮기는 프리셋 — weapon:1의 b 잡이 extraCancel로 취소되고 lane 2에 등록
    await setPresetLane(TEST_USER_ID, SERVER_ID, 2, L2, { kind: 'item', equipmentId: b.toString() });
    const r3 = await applyPreset(TEST_USER_ID, SERVER_ID, 2);
    expect(r3).toMatchObject({ queued: 1, cancelled: 1, changed: 2 });
    expect((await runningOf(b))?.lane).toBe(2);
    // ⑤ 비우기
    await setPresetLane(TEST_USER_ID, SERVER_ID, 3, L2, { kind: 'empty' });
    const r4 = await applyPreset(TEST_USER_ID, SERVER_ID, 3);
    expect(r4).toMatchObject({ cleared: 1, cancelled: 1, queued: 0 });
    expect(await runningOf(b)).toBeNull();
  });

  it('fillPresetFromCurrent — 강화 중 칸은 item, 빈 칸은 empty', async () => {
    const p = await fillPresetFromCurrent(TEST_USER_ID, SERVER_ID, 3);
    expect(Object.keys(p.lanes)).toHaveLength(6);
    for (const v of Object.values(p.lanes)) expect(['item', 'empty']).toContain(v!.kind);
  });
});
