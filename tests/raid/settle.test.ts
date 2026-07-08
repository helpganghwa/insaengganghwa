import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// 외부 부작용만 mock(푸시·리더보드) — 정산 코어(보상 적재·상태전이·멱등)는 실제 DB 경로로 검증.
vi.mock('@/lib/push/send', () => ({ sendPushToUsers: vi.fn(async () => {}) }));
vi.mock('@/lib/game/leaderboard/incremental', () => ({ bumpCountMetric: vi.fn(async () => {}) }));

import { settleRaid } from '@/lib/game/raid/settle';

import { endTestDb, sql, testDb } from '../db';

/**
 * raid/settle — 6시간 만료 레이드 정산(GDD §3.5). status='active' AND expire_at<=now() 조건부
 * 전이라 멱등. 보상 = 1회+ 공격 참여자 전원 동일 raid_rewards 적재(claim은 별도).
 * 커밋형 + 외부 부작용이라 cleanup 패턴(레이드 라이프사이클 전체 대신 end-state 직접 seed).
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;

let seq = 0;
async function seedRaid(opts: { expire: 'past' | 'future'; damage: number; attacks: number }): Promise<bigint> {
  seq += 1;
  const days = opts.expire === 'past' ? -1 : 1;
  const r = (await testDb.execute(sql`
    insert into raids (host_user_id, server_id, boss_code, phase1_hp, share_code, expire_at, status)
    values (${TEST_USER_ID}::uuid, ${SID}, 'slime_king', 100, ${'TR' + seq + '_' + process.pid},
      now() + make_interval(days => ${days}), 'active')
    returning id::text id
  `)) as unknown as { id: string }[];
  const raidId = BigInt(r[0]!.id);
  await testDb.execute(sql`
    insert into raid_participants (raid_id, user_id, total_damage, attacks_used)
    values (${raidId.toString()}::bigint, ${TEST_USER_ID}::uuid, ${opts.damage}, ${opts.attacks})
  `);
  return raidId;
}
async function rewardCount(raidId: bigint): Promise<number> {
  const r = (await testDb.execute(sql`
    select count(*)::int n from raid_rewards where raid_id = ${raidId.toString()}::bigint and user_id = ${TEST_USER_ID}::uuid
  `)) as unknown as { n: number }[];
  return r[0]!.n;
}
async function raidStatus(raidId: bigint): Promise<string> {
  const r = (await testDb.execute(
    sql`select status::text s from raids where id = ${raidId.toString()}::bigint`,
  )) as unknown as { s: string }[];
  return r[0]!.s;
}

afterEach(async () => {
  await testDb.execute(sql`delete from raid_rewards where user_id = ${TEST_USER_ID}::uuid`);
  await testDb.execute(sql`delete from raid_participants where user_id = ${TEST_USER_ID}::uuid`);
  await testDb.execute(sql`delete from raids where host_user_id = ${TEST_USER_ID}::uuid`);
});
afterAll(async () => {
  await endTestDb();
});

describe.skipIf(skip)('raid/settle — 레이드 정산', () => {
  it('만료 + 공격 참여자: settled, 페이즈 돌파, 보상 1건 적재, status=settled', async () => {
    const raidId = await seedRaid({ expire: 'past', damage: 100, attacks: 1 });
    const r = await settleRaid({ raidId });
    expect(r.settled).toBe(true);
    expect(r.phasesCleared).toBeGreaterThanOrEqual(1); // damage 100 ≥ phase1_hp 100
    expect(r.rewarded).toBe(1);
    expect(await rewardCount(raidId)).toBe(1);
    expect(await raidStatus(raidId)).toBe('settled');
  });

  it('멱등: 재정산은 settled=false·보상 중복 없음(조건부 전이)', async () => {
    const raidId = await seedRaid({ expire: 'past', damage: 100, attacks: 1 });
    await settleRaid({ raidId });
    const r2 = await settleRaid({ raidId });
    expect(r2.settled).toBe(false);
    expect(await rewardCount(raidId)).toBe(1); // onConflictDoNothing — 중복 없음
  });

  it('미만료: 아직 진행 중이면 settled=false·status active 유지', async () => {
    const raidId = await seedRaid({ expire: 'future', damage: 100, attacks: 1 });
    const r = await settleRaid({ raidId });
    expect(r.settled).toBe(false);
    expect(await raidStatus(raidId)).toBe('active');
    expect(await rewardCount(raidId)).toBe(0);
  });

  it('공격 0회 참여자는 보상 제외(winner = attacks_used ≥ 1)', async () => {
    const raidId = await seedRaid({ expire: 'past', damage: 100, attacks: 0 });
    const r = await settleRaid({ raidId });
    expect(r.settled).toBe(true);
    expect(r.rewarded).toBe(0);
    expect(await rewardCount(raidId)).toBe(0);
  });
});
