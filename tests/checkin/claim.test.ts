import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { claimCheckin } from '@/lib/game/checkin';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1; // user_checkin_state/checkin_claim_logs는 (user_id, server_id) 키(서버 샤딩).

/**
 * claimCheckin DB 통합 — 1일 1회 가드(KST) + state advance + 멱등 회귀.
 * 0013_checkin_v1.sql 적용된 환경에서만 의미 — 미적용 시 테이블 not exist로 fail.
 *
 * 매 테스트마다 state row를 초기화(dp=0, last=null)해 클린 시작.
 *
 * 수령은 **실제로 자원을 지급한다**(D28 = 칸 1,000💎 + 완주 보너스 1,000💎, D1/D7 = 상자).
 * state만 되감으면 공유 계정에 지급분이 그대로 쌓이므로(실행마다 +2,000💎·상자 50장 실측,
 * 2026-08-12) 지갑·상자·원장도 **실행 전 스냅샷으로 복원**한다. 증가분을 계산해 빼는 방식은
 * 중간 실패로 계산이 어긋나면 그대로 잔재가 되지만, 스냅샷 복원은 어긋날 여지가 없다.
 */
describe.skipIf(skip)('claimCheckin — DB 통합', () => {
  let baselineDiamond = 0n;
  let baselineBoxes: { slot: string; count: string }[] = [];
  let baselineLedgerId = 0n;

  async function snapshotResources() {
    const d = (await testDb.execute(sql`
      select diamond::text d from characters
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as {
      d: string;
    }[];
    baselineDiamond = BigInt(d[0]?.d ?? '0');
    baselineBoxes = (await testDb.execute(sql`
      select slot::text slot, count::text count from user_supply_boxes
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as {
      slot: string;
      count: string;
    }[];
    const l = (await testDb.execute(sql`
      select coalesce(max(id), 0)::text m from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { m: string }[];
    baselineLedgerId = BigInt(l[0]!.m);
  }

  /** 지급분 원복 — 지갑·상자는 스냅샷 값으로, 원장은 이 파일이 만든 checkin 행만 삭제. */
  async function restoreResources() {
    await testDb.execute(sql`
      update characters set diamond = ${baselineDiamond.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    for (const b of baselineBoxes) {
      await testDb.execute(sql`
        update user_supply_boxes set count = ${b.count}::bigint
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and slot = ${b.slot}::slot`);
    }
    // 스냅샷에 없던 슬롯 행 = 이번 수령이 새로 만든 것 → 통째로 제거.
    const kept = new Set(baselineBoxes.map((b) => b.slot));
    for (const slot of SUPPLY_SLOTS) {
      if (kept.has(slot)) continue;
      await testDb.execute(sql`
        delete from user_supply_boxes
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and slot = ${slot}::slot`);
    }
    await testDb.execute(sql`
      delete from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${baselineLedgerId.toString()}::bigint
        and reason = 'checkin'`);
  }

  async function resetState() {
    // 1차 가드: state. 2차 가드: 오늘 KST 로그 row 제거(UNIQUE 위반 회피).
    await testDb.execute(sql`
      insert into user_checkin_state (user_id, server_id, day_progress, last_claimed_kst_day, total_claimed_count)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, 0, null, 0)
      on conflict (user_id, server_id) do update
        set day_progress = 0, last_claimed_kst_day = null, total_claimed_count = 0, updated_at = now()
    `);
    await testDb.execute(sql`
      delete from checkin_claim_logs
      where user_id = ${TEST_USER_ID}::uuid
        and server_id = ${SERVER_ID}
        and kst_day = (now() at time zone 'Asia/Seoul')::date
    `);
  }

  beforeAll(async () => {
    await snapshotResources();
  });

  beforeEach(async () => {
    await resetState();
  });

  afterEach(async () => {
    // 케이스마다 즉시 원복 — 도중에 실패해도 잔재가 한 케이스분을 넘지 않는다.
    await restoreResources();
  });

  afterAll(async () => {
    // 마지막에도 깨끗하게.
    await resetState();
    await restoreResources();
    await endTestDb();
  });

  it('첫 수령: D1 → 무기 보급권 10장 + state 전진(dp=1, last=KST today)', async () => {
    const r = await claimCheckin({ userId: TEST_USER_ID, serverId: 1 });
    expect(r.cycleDay).toBe(1);
    expect(r.reward).toEqual({ kind: 'supply', slot: 'weapon', count: 10 });
    expect(r.totalClaimedCount).toBe(1);
    expect(r.cycleCompleted).toBe(false);

    const [state] = (await testDb.execute(sql`
      select day_progress::int dp, last_claimed_kst_day::text last
      from user_checkin_state where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
    `)) as unknown as { dp: number; last: string }[];
    expect(state!.dp).toBe(1);

    const [log] = (await testDb.execute(sql`
      select cycle_day::int cday, diamond_granted::text dia, boxes_granted::text boxes
      from checkin_claim_logs where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and kst_day = ${state!.last}::date
    `)) as unknown as { cday: number; dia: string; boxes: string }[];
    expect(log!.cday).toBe(1);
    expect(log!.dia).toBe('0');
    expect(JSON.parse(log!.boxes)).toMatchObject({ weapon: 10 });
  });

  it('같은 KST day 재수령 → CHECKIN_ALREADY_CLAIMED', async () => {
    await claimCheckin({ userId: TEST_USER_ID, serverId: 1 });
    await expect(claimCheckin({ userId: TEST_USER_ID, serverId: 1 })).rejects.toMatchObject({
      code: 'CHECKIN_ALREADY_CLAIMED',
    });
  });

  it('D7 마일스톤 — supply_set perSlot 10 (3슬롯 각 10장)', async () => {
    // dp=6 (이전 6칸 수령한 상태로 가정), last=어제 → 오늘 수령 시 cycleDay=7
    const yesterday = (await testDb.execute(
      sql`select ((now() at time zone 'Asia/Seoul')::date - 1)::text d`,
    )) as unknown as { d: string }[];
    await testDb.execute(sql`
      update user_checkin_state
      set day_progress = 6, last_claimed_kst_day = ${yesterday[0]!.d}::date, total_claimed_count = 6
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
    `);

    const r = await claimCheckin({ userId: TEST_USER_ID, serverId: 1 });
    expect(r.cycleDay).toBe(7);
    expect(r.reward).toEqual({ kind: 'supply_set', perSlot: 10 });
  });

  it('D28 수령 직후 dp = 0 (다음 사이클 D1 대기)', async () => {
    const yesterday = (await testDb.execute(
      sql`select ((now() at time zone 'Asia/Seoul')::date - 1)::text d`,
    )) as unknown as { d: string }[];
    await testDb.execute(sql`
      update user_checkin_state
      set day_progress = 27, last_claimed_kst_day = ${yesterday[0]!.d}::date, total_claimed_count = 27
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
    `);

    const r = await claimCheckin({ userId: TEST_USER_ID, serverId: 1 });
    expect(r.cycleDay).toBe(28);
    expect(r.cycleCompleted).toBe(true);

    const [state] = (await testDb.execute(sql`
      select day_progress::int dp
      from user_checkin_state where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
    `)) as unknown as { dp: number }[];
    expect(state!.dp).toBe(0);
  });
});
