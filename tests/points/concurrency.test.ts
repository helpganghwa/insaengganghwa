import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POINT_EXCHANGE_DIAMOND, POINT_EXTRA_PRICES } from '@/lib/game/balance';
import { buyExtra } from '@/lib/game/points/extra';
import { PointShopError, exchangePoints, extrasToday } from '@/lib/game/points/spend';
import { creditMileageForOrder, revokeMileageForOrder } from '@/lib/game/points/wallet';
import { kstDateString } from '@/lib/kst';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

/**
 * 포인트 지출의 동시성(2026-10-06 3차 점검) — 같은 순간에 여러 요청이 들어와도
 *   ① 잔액이 음수가 되지 않고 ② 받은 만큼만 빠지고 ③ 같은 요청 키는 한 번만 처리되고
 *   ④ 원장 합과 잔액이 같다 — 를 실제 DB에서 요청을 겹쳐 쏴서 확인한다(스테이징 테스트 계정, 끝나면 되돌림).
 * 순차 테스트(spend.test)는 이 성질을 보지 못한다: 조건부 UPDATE·유니크 키·행 잠금이 실제로 직렬화하는지는
 * 겹쳐 봐야 드러난다.
 */
const U = process.env.TEST_USER_ID ?? '';
const S = 1;
const TAG = `c${process.pid}x${Date.now() % 1e8}`;
let n = 0;
const key = () => `${TAG}k${++n}`;
const today = kstDateString();

type Settled<T> = { ok: true; v: T } | { ok: false; code: string };
const settle = async <T>(p: Promise<T>): Promise<Settled<T>> => {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    return { ok: false, code: e instanceof PointShopError ? e.code : `THROWN:${(e as Error)?.message ?? e}` };
  }
};

async function melee(): Promise<number> {
  const [r] = (await testDb.execute(sql`select melee_points::text as mp from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { mp: string }[];
  return Number(r?.mp ?? 0);
}
async function diamond(): Promise<bigint> {
  const [r] = (await testDb.execute(sql`select diamond::text as d from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { d: string }[];
  return BigInt(r?.d ?? '0');
}
async function mileage(): Promise<number> {
  const [r] = (await testDb.execute(sql`select balance::text as b from mileage_wallets where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: string }[];
  return Number(r?.b ?? 0);
}
/** 이 테스트가 남긴 원장 행(요청 키·주문 번호에 TAG가 들어 있다). */
async function myLedger(kind: 'melee' | 'mileage'): Promise<{ n: number; sum: number }> {
  const [r] = (await testDb.execute(sql`
    select count(*)::int as n, coalesce(sum(delta), 0)::text as s from point_ledger
    where user_id=${U}::uuid and kind=${kind} and ref like ${'%' + TAG + '%'}`)) as unknown as { n: number; s: string }[];
  return { n: Number(r?.n ?? 0), sum: Number(r?.s ?? 0) };
}
/** 마일리지: 지갑 잔액 == 원장 합(그 서버). 깨지면 어딘가에서 한쪽만 바뀐 것. */
async function mileageBooksBalanced(): Promise<boolean> {
  const [r] = (await testDb.execute(sql`
    select coalesce((select balance from mileage_wallets where user_id=${U}::uuid and server_id=${S}), 0)::text as w,
           coalesce((select sum(delta) from point_ledger where user_id=${U}::uuid and kind='mileage' and server_id=${S}), 0)::text as l`)) as unknown as { w: string; l: string }[];
  return r?.w === r?.l;
}

describe.skipIf(!U)('포인트 지출 — 동시 요청(DB 통합)', () => {
  let baseMelee = 0;
  let baseDiamond = 0n;

  beforeEach(async () => {
    baseMelee = await melee();
    baseDiamond = await diamond();
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
  });
  afterEach(async () => {
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
    await testDb.execute(sql`delete from point_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`delete from diamond_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`update characters set melee_points=${baseMelee}, diamond=${baseDiamond.toString()}::bigint where user_id=${U}::uuid and server_id=${S}`);
    await resyncTestMileage(U); // 마일리지 지갑은 원장에서 다시 세운다(내 행은 위에서 지웠다)
  });
  afterAll(async () => {
    await endTestDb();
  });

  const setMelee = (mp: number) => testDb.execute(sql`update characters set melee_points=${mp} where user_id=${U}::uuid and server_id=${S}`);

  it('교환: 서로 다른 요청 10건이 겹쳐도 잔액만큼만(3건) 처리되고 음수가 되지 않는다', async () => {
    await setMelee(30);
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => settle(exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: key() }))),
    );
    const ok = rs.filter((r) => r.ok);
    const fail = rs.filter((r) => !r.ok) as { ok: false; code: string }[];
    expect(ok.length).toBe(3);
    expect(fail.every((f) => f.code === 'INSUFFICIENT_POINTS')).toBe(true);
    expect(await melee()).toBe(0);
    expect((await diamond()) - baseDiamond).toBe(BigInt(3 * 10 * POINT_EXCHANGE_DIAMOND));
    // 원장: 처리된 3건만 남는다(실패한 요청의 원장 행은 함께 되돌려진다).
    expect(await myLedger('melee')).toEqual({ n: 3, sum: -30 });
    const [dl] = (await testDb.execute(sql`
      select count(*)::int as n, coalesce(sum(delta), 0)::text as s from diamond_ledger
      where user_id=${U}::uuid and reason='point_exchange_melee' and ref like ${'%' + TAG + '%'}`)) as unknown as { n: number; s: string }[];
    expect(dl).toEqual({ n: 3, s: String(3 * 10 * POINT_EXCHANGE_DIAMOND) });
  });

  it('교환: 같은 요청 키 6건이 겹치면 한 번만 처리된다', async () => {
    await setMelee(100);
    const k = key();
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => settle(exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: k }))),
    );
    expect(rs.every((r) => r.ok)).toBe(true);
    const fresh = rs.filter((r) => r.ok && !r.v.duplicate);
    expect(fresh.length).toBe(1);
    expect(await melee()).toBe(90);
    expect((await diamond()) - baseDiamond).toBe(BigInt(10 * POINT_EXCHANGE_DIAMOND));
    expect(await myLedger('melee')).toEqual({ n: 1, sum: -10 });
    // 재전송으로 판정된 응답도 같은 서버 잔액을 돌려준다.
    const bal = (await diamond()).toString();
    for (const r of rs) if (r.ok) expect(r.v.diamondBalance).toBe(bal);
  });

  it('마일리지 교환: 겹친 요청도 지갑 잔액만큼만 처리되고, 지갑과 원장이 맞는다', async () => {
    // 지갑은 실제 적립 함수로 채운다(원장 행이 함께 생겨 지갑 == 원장 합이 유지된다). ₩25,000 → 250점.
    const before = await mileage();
    expect(await creditMileageForOrder(testDb, { userId: U, serverId: S, orderId: `${TAG}_m1`, amountKrw: 25_000, note: '테스트 ₩25,000' })).toBe(250);
    const have = before + 250;
    const rs = await Promise.all(
      Array.from({ length: 8 }, () => settle(exchangePoints(U, S, { kind: 'mileage', target: 'diamond', pack: 10, key: key() }))),
    );
    const ok = rs.filter((r) => r.ok).length;
    expect(ok).toBe(Math.min(8, Math.floor(have / 100)));
    expect(await mileage()).toBe(have - ok * 100);
    expect(await mileage()).toBeGreaterThanOrEqual(0);
    expect((await diamond()) - baseDiamond).toBe(BigInt(ok * 10 * POINT_EXCHANGE_DIAMOND));
    expect(await mileageBooksBalanced()).toBe(true);
  });

  it('추가 횟수: 가격 확인 없이 겹친 5건은 2건만(5 → 10pt) 사지고 나머지는 최대치로 막힌다', async () => {
    await setMelee(100);
    const rs = await Promise.all(Array.from({ length: 5 }, () => settle(buyExtra(U, S, { item: 'tower', kind: 'melee', key: key() }))));
    const ok = rs.filter((r) => r.ok) as { ok: true; v: Awaited<ReturnType<typeof buyExtra>> }[];
    const fail = rs.filter((r) => !r.ok) as { ok: false; code: string }[];
    expect(ok.length).toBe(POINT_EXTRA_PRICES.tower.length);
    expect(ok.map((r) => r.v.spent).sort((a, b) => a - b)).toEqual([...POINT_EXTRA_PRICES.tower]);
    expect(fail.every((f) => f.code === 'MAX_REACHED')).toBe(true);
    expect(await extrasToday(testDb, U, S, 'tower')).toBe(2);
    expect(await melee()).toBe(100 - 15);
    expect(await myLedger('melee')).toEqual({ n: 2, sum: -15 });
  });

  it('추가 횟수: 같은 가격을 보고 겹쳐 누른 5건은 1건만 사지고 나머지는 가격 변경으로 막힌다', async () => {
    await setMelee(100);
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => settle(buyExtra(U, S, { item: 'raid', kind: 'melee', key: key(), expectedPrice: POINT_EXTRA_PRICES.raid[0] }))),
    );
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect((rs.filter((r) => !r.ok) as { ok: false; code: string }[]).every((f) => f.code === 'PRICE_CHANGED')).toBe(true);
    expect(await extrasToday(testDb, U, S, 'raid')).toBe(1);
    expect(await melee()).toBe(100 - POINT_EXTRA_PRICES.raid[0]);
    expect(await myLedger('melee')).toEqual({ n: 1, sum: -POINT_EXTRA_PRICES.raid[0] });
  });

  it('추가 횟수: 같은 요청 키 5건이 겹치면 한 번만 사지고 나머지는 이미 산 구매로 답한다', async () => {
    await setMelee(100);
    const k = key();
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => settle(buyExtra(U, S, { item: 'tower', kind: 'melee', key: k, expectedPrice: POINT_EXTRA_PRICES.tower[0] }))),
    );
    // 진 쪽은 가격이 바뀐 것으로 보이지만(먼저 산 요청이 횟수를 올렸다) 같은 키라 '이미 산 구매'로 답해야 한다.
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rs.filter((r) => r.ok && !r.v.duplicate).length).toBe(1);
    expect(await extrasToday(testDb, U, S, 'tower')).toBe(1);
    expect(await melee()).toBe(100 - POINT_EXTRA_PRICES.tower[0]);
    expect(await myLedger('melee')).toEqual({ n: 1, sum: -POINT_EXTRA_PRICES.tower[0] });
  });

  it('추가 횟수를 마일리지로: 지갑에서만 빠지고 대난투 포인트는 그대로', async () => {
    await setMelee(7);
    const before = await mileage();
    await creditMileageForOrder(testDb, { userId: U, serverId: S, orderId: `${TAG}_m2`, amountKrw: 10_000, note: '테스트 ₩10,000' }); // +100
    const r = await buyExtra(U, S, { item: 'tower', kind: 'mileage', key: key(), expectedPrice: POINT_EXTRA_PRICES.tower[0] });
    expect(r).toMatchObject({ kind: 'mileage', spent: POINT_EXTRA_PRICES.tower[0] * 10, bought: 1, duplicate: false });
    expect(await mileage()).toBe(before + 100 - 50);
    expect(await melee()).toBe(7);
    expect(await mileageBooksBalanced()).toBe(true);
  });

  it('마일리지 교환과 환불 회수가 겹쳐도 지갑은 음수가 되지 않고 원장과 맞는다', async () => {
    const before = await mileage();
    const orderId = `${TAG}_o1`;
    expect(await creditMileageForOrder(testDb, { userId: U, serverId: S, orderId, amountKrw: 15_000, note: '테스트 ₩15,000' })).toBe(150);
    // 같은 순간: 유저는 100점을 다이아로 바꾸고, 환불 처리는 그 주문의 150점을 회수한다(실제 환불처럼 트랜잭션 안에서).
    const [ex, rv] = await Promise.all([
      settle(exchangePoints(U, S, { kind: 'mileage', target: 'diamond', pack: 10, key: key() })),
      testDb.transaction((tx) => revokeMileageForOrder(tx as never, { userId: U, orderId })),
    ]);
    const spent = ex.ok ? 100 : 0;
    const after = await mileage();
    expect(after).toBeGreaterThanOrEqual(0);
    expect(rv.credited).toBe(150);
    expect(rv.taken).toBeGreaterThanOrEqual(0);
    expect(rv.taken).toBeLessThanOrEqual(150);
    // 들어온 것(기존 + 150)에서 쓴 것과 회수한 것을 뺀 값이 지갑에 남는다 — 어느 쪽이 먼저 처리됐든.
    expect(after).toBe(before + 150 - spent - rv.taken);
    // 교환이 먼저면 회수는 남은 만큼만(부족분이 생긴다), 회수가 먼저면 교환은 잔액 부족으로 거절된다.
    if (ex.ok) expect(rv.taken).toBe(Math.min(before + 50, 150));
    else expect(ex.code).toBe('INSUFFICIENT_POINTS');
    expect(await mileageBooksBalanced()).toBe(true);
  });
});
