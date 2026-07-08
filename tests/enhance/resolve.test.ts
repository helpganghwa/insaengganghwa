import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveEnhance } from '@/lib/game/enhance/resolve';
import { EnhanceError } from '@/lib/game/enhance/queue';

import { endTestDb, makeRunningJob, pickUnusedCatalogId, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;

/**
 * resolveEnhance DB 통합 — 결과 트랜잭션 무결성(원자성·멱등) 회귀 방지.
 * 이 테스트가 green이어야 C(단일 왕복 multi-CTE) 재시도의 게이트.
 *
 * 결정성: BALANCE §1.2 3분기 모델(success/hold/down)이라 outcome은 RNG roll에 의존.
 * 테스트 전용 rngBp 주입으로 결정성 확보:
 *  - rng=0     → roll=0      → success(success>0이면) / 하락(success=0, down>0)
 *  - rng=9999  → roll=9999   → hold(hold>0이면)
 * timing+baseRateBp+rngBp 조합으로 의도한 분기를 강제한다.
 */
describe.skipIf(skip)('resolveEnhance — DB 통합', () => {
  let cleanupFn: null | (() => Promise<void>) = null;
  let catalogItemId = 0;

  beforeEach(async () => {
    catalogItemId = await pickUnusedCatalogId(TEST_USER_ID);
  });

  afterEach(async () => {
    if (cleanupFn) await cleanupFn();
    cleanupFn = null;
  });

  afterAll(async () => {
    await endTestDb();
  });

  it('success: 레벨 +1, codex 생성, 로그 success, 잡 completed', async () => {
    const { instanceId, jobId, cleanup } = await makeRunningJob({
      userId: TEST_USER_ID,
      catalogItemId,
      fromLevel: 10,
      baseRateBp: 10000,
      timing: 'full',
    });
    cleanupFn = cleanup;

    // rngBp=5000: mega 카브아웃(작은 상단 분량) 위·success 밴드 내 → 항상 success 강제(미지정 시 가끔 mega로 flaky).
    const r = await resolveEnhance({ jobId, userId: TEST_USER_ID, rngBp: () => 5000 });
    expect(r.outcome).toBe('success');
    expect(r.fromLevel).toBe(10);
    expect(r.toLevel).toBe(11);
    expect(r.userEquipmentId).toBe(instanceId);

    // 인스턴스 레벨 11로 갱신
    const inst = (await testDb.execute(sql`select enhance_level lv from user_equipment where id = ${instanceId.toString()}::bigint`)) as unknown as { lv: number }[];
    expect(inst[0]?.lv).toBe(11);
    // 도감 신규 11
    const codex = (await testDb.execute(sql`select max_enhance_level lv from user_equipment where user_id = ${TEST_USER_ID}::uuid and catalog_item_id = ${catalogItemId}`)) as unknown as { lv: number }[];
    expect(codex[0]?.lv).toBe(11);
    // 로그 success
    const log = (await testDb.execute(sql`select result::text res from enhancement_logs where user_equipment_id = ${instanceId.toString()}::bigint order by id desc limit 1`)) as unknown as { res: string }[];
    expect(log[0]?.res).toBe('success');
    // 잡 completed
    const job = (await testDb.execute(sql`select status::text st from enhancement_jobs where id = ${jobId.toString()}::bigint`)) as unknown as { st: string }[];
    expect(job[0]?.st).toBe('completed');
  });

  it('hold: 안전 구간(L=10) 실패 → 레벨 유지, 로그 hold', async () => {
    const fromLevel = 10;
    // L=10: down=0%, baseRate=100%. timing=zero → success=0, hold=10000 → 항상 hold.
    // rngBp=9999로 hold 영역 강제.
    const { instanceId, jobId, cleanup } = await makeRunningJob({
      userId: TEST_USER_ID,
      catalogItemId,
      fromLevel,
      baseRateBp: 10000,
      timing: 'zero',
    });
    cleanupFn = cleanup;

    const r = await resolveEnhance({
      jobId,
      userId: TEST_USER_ID,
      rngBp: () => 9999,
    });
    expect(r.outcome).toBe('hold');
    expect(r.toLevel).toBe(fromLevel);

    const inst = (await testDb.execute(sql`select enhance_level lv from user_equipment where id = ${instanceId.toString()}::bigint`)) as unknown as { lv: number }[];
    expect(inst[0]?.lv).toBe(fromLevel); // 레벨 불변
    const log = (await testDb.execute(sql`select result::text res from enhancement_logs where user_equipment_id = ${instanceId.toString()}::bigint order by id desc limit 1`)) as unknown as { res: string }[];
    expect(log[0]?.res).toBe('hold');
  });

  it('down: L=60(ℓ52~99 위험구간) → 레벨 −1(하한 51), 로그 down', async () => {
    const fromLevel = 60;
    // L=60: base=38%, down=25%, hold=37%. timing=zero → success=0, down=2500, hold=7500.
    // rngBp=0 → 0 < 0(success) 아님, 0 < 2500(down) 맞음 → down 강제.
    const { instanceId, jobId, cleanup } = await makeRunningJob({
      userId: TEST_USER_ID,
      catalogItemId,
      fromLevel,
      baseRateBp: 10000,
      timing: 'zero',
    });
    cleanupFn = cleanup;

    const r = await resolveEnhance({
      jobId,
      userId: TEST_USER_ID,
      rngBp: () => 0,
    });
    expect(r.outcome).toBe('down');
    expect(r.toLevel).toBe(59);

    const inst = (await testDb.execute(sql`select enhance_level lv from user_equipment where id = ${instanceId.toString()}::bigint`)) as unknown as { lv: number }[];
    expect(inst[0]?.lv).toBe(59);
    const log = (await testDb.execute(sql`select result::text res from enhancement_logs where user_equipment_id = ${instanceId.toString()}::bigint order by id desc limit 1`)) as unknown as { res: string }[];
    expect(log[0]?.res).toBe('down');
  });

  it('idempotency: 두 번째 호출은 JOB_NOT_FOUND (이중 정산 방지)', async () => {
    const { jobId, cleanup } = await makeRunningJob({
      userId: TEST_USER_ID,
      catalogItemId,
      fromLevel: 10,
      baseRateBp: 10000,
      timing: 'full',
    });
    cleanupFn = cleanup;

    // rngBp=5000으로 success 강제(mega면 outcome 단정 실패 — 위 success 테스트와 동일 이유).
    const first = await resolveEnhance({ jobId, userId: TEST_USER_ID, rngBp: () => 5000 });
    expect(first.outcome).toBe('success'); // 첫 호출 정상

    await expect(
      resolveEnhance({ jobId, userId: TEST_USER_ID }),
    ).rejects.toBeInstanceOf(EnhanceError);
    try {
      await resolveEnhance({ jobId, userId: TEST_USER_ID });
    } catch (e) {
      expect((e as EnhanceError).code).toBe('JOB_NOT_FOUND');
    }
  });
});
