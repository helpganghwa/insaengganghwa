import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimAllRaidRewards, claimRaidReward } from '@/lib/game/raid/claim';
import { RaidError } from '@/lib/game/raid/open';

import { endTestDb, sql, testDb } from '../db';

/**
 * raid/claim — 결산 보상 수령(단건·모두 받기 #545). 자체 tx라 롤백 불가 → cleanup 패턴.
 * 회귀 포인트: 모두 받기 합산·정산 전/이미 받음/다른 서버 제외·재호출 빈 결과·단건과 이중 지급 없음.
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;
const OTHER_SID = 2;

let seq = 0;
async function seedReward(opts: {
  boxes: { weapon: number; armor: number; accessory: number };
  status?: 'settled' | 'active';
  claimed?: boolean;
  serverId?: number;
}): Promise<bigint> {
  seq += 1;
  const r = (await testDb.execute(sql`
    insert into raids (host_user_id, server_id, boss_code, phase1_hp, share_code, expire_at, status)
    values (${TEST_USER_ID}::uuid, ${opts.serverId ?? SID}, 'slime_king', 100, ${'TC' + seq + '_' + process.pid},
      now() - interval '1 hour', ${opts.status ?? 'settled'})
    returning id::text id
  `)) as unknown as { id: string }[];
  const raidId = BigInt(r[0]!.id);
  await testDb.execute(sql`
    insert into raid_rewards (raid_id, user_id, boxes, claimed_at)
    values (${raidId.toString()}::bigint, ${TEST_USER_ID}::uuid, ${sql.raw(`'${JSON.stringify(opts.boxes)}'::jsonb`)},
      ${opts.claimed ? sql`now()` : sql`null`})
  `);
  return raidId;
}

async function readBoxes(serverId: number): Promise<Record<string, number>> {
  const r = (await testDb.execute(sql`
    select slot::text slot, count::int n from user_supply_boxes where user_id = ${TEST_USER_ID}::uuid and server_id = ${serverId}
  `)) as unknown as { slot: string; n: number }[];
  const out: Record<string, number> = { weapon: 0, armor: 0, accessory: 0 };
  for (const x of r) out[x.slot] = x.n;
  return out;
}
async function claimedAt(raidId: bigint): Promise<boolean> {
  const r = (await testDb.execute(sql`
    select claimed_at is not null c from raid_rewards where raid_id = ${raidId.toString()}::bigint and user_id = ${TEST_USER_ID}::uuid
  `)) as unknown as { c: boolean }[];
  return r[0]!.c;
}

let base1: Record<string, number>;
let base2: Record<string, number>;
async function restoreBoxes(serverId: number, base: Record<string, number>) {
  for (const [slot, n] of Object.entries(base)) {
    await testDb.execute(sql`
      update user_supply_boxes set count = ${n} where user_id = ${TEST_USER_ID}::uuid and server_id = ${serverId} and slot = ${slot}
    `);
  }
}

beforeEach(async () => {
  base1 = await readBoxes(SID);
  base2 = await readBoxes(OTHER_SID);
});
afterEach(async () => {
  await testDb.execute(sql`delete from raid_rewards where user_id = ${TEST_USER_ID}::uuid`);
  await testDb.execute(sql`delete from raids where host_user_id = ${TEST_USER_ID}::uuid`);
  await restoreBoxes(SID, base1);
  await restoreBoxes(OTHER_SID, base2);
});
afterAll(async () => {
  await endTestDb();
});

describe.skipIf(skip)('raid/claim — 보상 모두 받기', () => {
  it('정산 끝난 미수령만 합산 지급, 정산 전·이미 받음·다른 서버는 제외', async () => {
    const a = await seedReward({ boxes: { weapon: 3, armor: 2, accessory: 1 } });
    const b = await seedReward({ boxes: { weapon: 2, armor: 0, accessory: 4 } });
    const notSettled = await seedReward({ boxes: { weapon: 9, armor: 9, accessory: 9 }, status: 'active' });
    const already = await seedReward({ boxes: { weapon: 9, armor: 9, accessory: 9 }, claimed: true });
    const other = await seedReward({ boxes: { weapon: 9, armor: 9, accessory: 9 }, serverId: OTHER_SID });

    const r = await claimAllRaidRewards({ userId: TEST_USER_ID, serverId: SID });
    expect(new Set(r.raidIds)).toEqual(new Set([a.toString(), b.toString()]));
    expect(r.boxes).toEqual({ weapon: 5, armor: 2, accessory: 5 });

    const now1 = await readBoxes(SID);
    expect(now1.weapon - base1.weapon!).toBe(5);
    expect(now1.armor - base1.armor!).toBe(2);
    expect(now1.accessory - base1.accessory!).toBe(5);
    expect(await readBoxes(OTHER_SID)).toEqual(base2);

    expect(await claimedAt(a)).toBe(true);
    expect(await claimedAt(b)).toBe(true);
    expect(await claimedAt(notSettled)).toBe(false);
    expect(await claimedAt(other)).toBe(false);
    expect(await claimedAt(already)).toBe(true);
  });

  it('다시 누르면 빈 결과(오류 아님), 상자 추가 없음', async () => {
    await seedReward({ boxes: { weapon: 1, armor: 1, accessory: 1 } });
    await claimAllRaidRewards({ userId: TEST_USER_ID, serverId: SID });
    const mid = await readBoxes(SID);
    const r = await claimAllRaidRewards({ userId: TEST_USER_ID, serverId: SID });
    expect(r.raidIds).toEqual([]);
    expect(r.boxes).toEqual({ weapon: 0, armor: 0, accessory: 0 });
    expect(await readBoxes(SID)).toEqual(mid);
  });

  it('모두 받기 뒤 단건 수령은 이미 받음, 동시에 눌러도 한 번만 지급', async () => {
    const a = await seedReward({ boxes: { weapon: 2, armor: 2, accessory: 2 } });
    const b = await seedReward({ boxes: { weapon: 1, armor: 1, accessory: 1 } });
    const [single, all] = await Promise.allSettled([
      claimRaidReward({ userId: TEST_USER_ID, raidId: a }),
      claimAllRaidRewards({ userId: TEST_USER_ID, serverId: SID }),
    ]);
    const now = await readBoxes(SID);
    // a(2)와 b(1)가 어느 쪽이든 정확히 한 번씩만 — 합계 슬롯당 3.
    expect(now.weapon - base1.weapon!).toBe(3);
    expect(now.armor - base1.armor!).toBe(3);
    expect(now.accessory - base1.accessory!).toBe(3);
    if (single.status === 'rejected') {
      expect(single.reason).toBeInstanceOf(RaidError);
      expect((single.reason as RaidError).code).toBe('REWARD_ALREADY_CLAIMED');
    }
    expect(all.status).toBe('fulfilled');
    await expect(claimRaidReward({ userId: TEST_USER_ID, raidId: b })).rejects.toMatchObject({ code: 'REWARD_ALREADY_CLAIMED' });
  });
});
