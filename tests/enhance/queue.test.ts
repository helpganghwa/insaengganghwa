import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { queueEnhance } from '@/lib/game/enhance/queue';
import { baseSuccessRateBp, downRateBp, enhanceDurationMs } from '@/lib/game/balance';

import { endTestDb, pickUnusedCatalogId, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;

/**
 * queueEnhance DB 통합 — (A) 큐 등록의 무결성 회귀 방지(§5.4·§6.1).
 * 강화 시도는 무료(자원 차감 없음) — 검증 대상은 장비 잠금·중복 방지·lane 배정·
 * **등록 시점 스냅샷(from/target 레벨·baseRate·down·duration)의 소급 불변**이다.
 * 공유 스테이징 DB(DIRECT_URL) fixture는 afterEach에서 반드시 정리.
 */
describe.skipIf(skip)('queueEnhance — DB 통합', () => {
  let createdEquipId: bigint | null = null;
  let createdJobId: bigint | null = null;
  let catalogItemId = 0;

  beforeEach(async () => {
    // 미보유 + lane 여유 있는 슬롯의 catalog — 등록이 SLOT_BUSY 없이 성공하도록 보장.
    catalogItemId = await pickUnusedCatalogId(TEST_USER_ID);
  });

  afterEach(async () => {
    // 생성 역순 정리(best-effort) — 잡이 user_equipment를 참조하므로 잡 먼저.
    if (createdJobId != null) {
      try {
        await testDb.execute(sql`delete from enhancement_jobs where id = ${createdJobId.toString()}::bigint`);
      } catch {}
    }
    if (createdEquipId != null) {
      try {
        await testDb.execute(sql`delete from user_equipment where id = ${createdEquipId.toString()}::bigint`);
      } catch {}
    }
    createdJobId = null;
    createdEquipId = null;
  });

  afterAll(async () => {
    await endTestDb();
  });

  async function insertEquip(level: number): Promise<bigint> {
    const r = (await testDb.execute(sql`
      insert into user_equipment (user_id, catalog_item_id, enhance_level, transcend_level)
      values (${TEST_USER_ID}::uuid, ${catalogItemId}, ${level}, 0)
      returning id::text id`)) as unknown as { id: string }[];
    const id = BigInt(r[0]!.id);
    createdEquipId = id;
    return id;
  }

  it('success: running 잡 생성 + 레벨·확률·시간 스냅샷 정확', async () => {
    const level = 12;
    const equipId = await insertEquip(level);

    const res = await queueEnhance({ userId: TEST_USER_ID, userEquipmentId: equipId });
    createdJobId = res.jobId;

    // 반환 스냅샷 = balance 공식과 정확히 일치(§6.3 소급 불변의 원천값).
    expect(res.fromLevel).toBe(level);
    expect(res.targetLevel).toBe(level + 1);
    expect(res.baseRateBp).toBe(baseSuccessRateBp(level));
    expect(res.durationMs).toBe(enhanceDurationMs(level));

    // DB 잡 행 검증 — running·유효 lane·스냅샷 박제.
    const rows = (await testDb.execute(sql`
      select status::text status, slot_lane, from_level, target_level, base_rate_bp, down_rate_bp
      from enhancement_jobs where id = ${res.jobId.toString()}::bigint`)) as unknown as {
      status: string; slot_lane: number; from_level: number; target_level: number; base_rate_bp: number; down_rate_bp: number;
    }[];
    expect(rows[0]?.status).toBe('running');
    expect([1, 2]).toContain(Number(rows[0]?.slot_lane));
    expect(Number(rows[0]?.from_level)).toBe(level);
    expect(Number(rows[0]?.target_level)).toBe(level + 1);
    expect(Number(rows[0]?.base_rate_bp)).toBe(baseSuccessRateBp(level));
    expect(Number(rows[0]?.down_rate_bp)).toBe(downRateBp(level));
  });

  it('EQUIPMENT_NOT_FOUND: 존재하지 않는 장비 등록 거부', async () => {
    await expect(
      queueEnhance({ userId: TEST_USER_ID, userEquipmentId: 999999999999n }),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_NOT_FOUND' });
  });

  it('ALREADY_ENHANCING: 같은 장비 동시 강화 1건 초과 거부', async () => {
    const equipId = await insertEquip(5);
    const first = await queueEnhance({ userId: TEST_USER_ID, userEquipmentId: equipId });
    createdJobId = first.jobId;

    await expect(
      queueEnhance({ userId: TEST_USER_ID, userEquipmentId: equipId }),
    ).rejects.toMatchObject({ code: 'ALREADY_ENHANCING' });
  });
});
