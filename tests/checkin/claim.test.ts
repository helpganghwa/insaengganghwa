import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { claimCheckin } from '@/lib/game/checkin';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1; // user_checkin_state/checkin_claim_logs는 (user_id, server_id) 키(서버 샤딩).

/**
 * claimCheckin DB 통합 — 1일 1회 가드(KST) + state advance + 멱등 회귀.
 * 0013_checkin_v1.sql 적용된 환경에서만 의미 — 미적용 시 테이블 not exist로 fail.
 *
 * 매 테스트마다 state row를 초기화(dp=0, last=null)해 클린 시작.
 */
describe.skipIf(skip)('claimCheckin — DB 통합', () => {
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

  beforeEach(async () => {
    await resetState();
  });

  afterAll(async () => {
    // 마지막에도 깨끗하게.
    await resetState();
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
