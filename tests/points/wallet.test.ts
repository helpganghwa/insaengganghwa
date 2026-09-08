import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MILEAGE_KRW_PER_POINT, mileageForKrw } from '@/lib/game/balance';
import { POINTS_COPY } from '@/lib/game/points/types';
import { creditMeleePoints, creditMileageForOrder, getPointsOverview, revokeMileageForOrder } from '@/lib/game/points/wallet';

import { endTestDb, sql, testDb } from '../db';

describe('마일리지 적립률(순수)', () => {
  it('100원당 1점, 버림, 문구와 1:1', () => {
    expect(MILEAGE_KRW_PER_POINT).toBe(100);
    expect(mileageForKrw(9900)).toBe(99);
    expect(mileageForKrw(1000)).toBe(10);
    expect(mileageForKrw(99)).toBe(0);
    expect(mileageForKrw(-5)).toBe(0);
    expect(POINTS_COPY.mileage).toContain('1%');
  });
});

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const TAG = `t${process.pid}_${Date.now()}`;

async function balances() {
  const [r] = (await testDb.execute(sql`
    select (select melee_points::text from characters where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}) as mp,
           (select mileage::text from profiles where id=${TEST_USER_ID}::uuid) as ml
  `)) as unknown as { mp: string | null; ml: string | null }[];
  return { mp: Number(r?.mp ?? 0), ml: Number(r?.ml ?? 0) };
}

describe.skipIf(skip)('포인트 지갑 — DB 통합', () => {
  let base = { mp: 0, ml: 0 };
  beforeEach(async () => {
    base = await balances();
  });
  afterEach(async () => {
    await testDb.execute(sql`delete from point_ledger where user_id=${TEST_USER_ID}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`update characters set melee_points=${base.mp} where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID}`);
    await testDb.execute(sql`update profiles set mileage=${base.ml} where id=${TEST_USER_ID}::uuid`);
  });

  it('대난투 포인트: 같은 (battle, user)는 한 번만 적립된다', async () => {
    const battleId = `9${Date.now() % 100000000}${TAG.length}`; // ref 유일성용 가짜 battle id
    const ref = `${battleId}_${TAG}`;
    const a = await creditMeleePoints(testDb, { userId: TEST_USER_ID, serverId: SERVER_ID, battleId: ref, points: 7, note: '대난투 3위' });
    const b = await creditMeleePoints(testDb, { userId: TEST_USER_ID, serverId: SERVER_ID, battleId: ref, points: 7, note: '대난투 3위' });
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect((await balances()).mp - base.mp).toBe(7);
  });

  it('마일리지: 주문당 1회 적립, 환불 시 회수, 부족분은 기록', async () => {
    const orderId = `${TAG}_o1`;
    expect(await creditMileageForOrder(testDb, { userId: TEST_USER_ID, orderId, amountKrw: 9900, note: '테스트 ₩9,900' })).toBe(99);
    expect(await creditMileageForOrder(testDb, { userId: TEST_USER_ID, orderId, amountKrw: 9900, note: '테스트 ₩9,900' })).toBe(0);
    expect((await balances()).ml - base.ml).toBe(99);
    // 잔액을 일부 써 버린 상황을 흉내 — 60점만 남김
    await testDb.execute(sql`update profiles set mileage=${base.ml + 60} where id=${TEST_USER_ID}::uuid`);
    // 기존 잔액(base.ml)이 있으면 그만큼 더 회수 가능하므로 taken = min(base.ml+60, 99)
    const r = await revokeMileageForOrder(testDb, { userId: TEST_USER_ID, orderId });
    expect(r.credited).toBe(99);
    expect(r.taken).toBe(Math.min(base.ml + 60, 99));
    expect((await balances()).ml).toBe(base.ml + 60 - r.taken);
    const again = await revokeMileageForOrder(testDb, { userId: TEST_USER_ID, orderId });
    expect(again.taken).toBe(0);
    const [row] = (await testDb.execute(sql`select note from point_ledger where kind='mileage' and ref=${'order:' + orderId + ':refund'}`)) as unknown as { note: string }[];
    expect(row?.note.startsWith('환불 회수')).toBe(true);
  });

  it('개요: 잔액과 최근 적립 3건(최신순)', async () => {
    for (let i = 1; i <= 4; i++) {
      await creditMeleePoints(testDb, { userId: TEST_USER_ID, serverId: SERVER_ID, battleId: `${TAG}_b${i}`, points: i, note: `대난투 ${i}위`, at: new Date(Date.now() - (5 - i) * 60_000) });
    }
    const o = await getPointsOverview(TEST_USER_ID, SERVER_ID);
    expect(o.melee.balance - base.mp).toBe(10);
    expect(o.melee.recent).toHaveLength(3);
    expect(o.melee.recent[0]!.note).toBe('대난투 4위');
    expect(o.melee.recent[0]!.delta).toBe(4);
    expect(o.melee.recent[0]!.date).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });
});

if (!skip) {
  afterEach(() => undefined);
  process.on('beforeExit', () => void endTestDb());
}
