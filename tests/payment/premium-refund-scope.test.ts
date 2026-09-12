import { afterAll, describe, expect, it } from 'vitest';

import { reclaimProductGrant } from '@/lib/game/shop/grant';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

/**
 * 프리미엄 환불 회수 — **주문 단위** 역연산 회귀 방지(2026-09-12).
 *
 * 프리미엄의 모든 판정(일일 지급 창·"N일 남음"·재구매 차단)은 shop_purchases.updated_at 하나에서
 * 나오고 그 값은 구매마다 덮어써진다. 그래서 "다른 paid 주문이 존재하는가"로 판단하면, 한참 전에
 * 만료된 주문이 남아 있다는 이유로 **환불된 주문이 세팅한 창이 그대로 살아버린다**(무상 드립 29일).
 * 올바른 역연산은 남은 주문 중 가장 최근 시각으로 창을 되돌리는 것이다.
 *
 * 전부 롤백 트랜잭션 — 공유 스테이징 DB를 오염시키지 않는다.
 */
type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];
const ROLLBACK = Symbol('rollback');

/** 트랜잭션 안에서 fn을 돌리고 무조건 롤백한다. */
async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

/** 프리미엄 주문 한 건을 넣는다. status/시각을 직접 지정. */
async function order(tx: Tx, pid: string, status: string, at: string): Promise<void> {
  await tx.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw,
                            diamond_granted, status, paid_at, created_at)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, 'premium', 0, 0,
            ${sql.raw(`'${status}'::iap_status`)}, ${at}::timestamptz, ${at}::timestamptz)`);
}

/** shop_purchases의 프리미엄 창(updated_at)을 지정 시각으로 세팅. */
async function setWindow(tx: Tx, at: string): Promise<void> {
  await tx.execute(sql`
    insert into shop_purchases (user_id, server_id, product_id, period_key, updated_at)
    values (${TEST_USER_ID}::uuid, ${SERVER_ID}, 'premium', 'test', ${at}::timestamptz)
    on conflict (user_id, server_id, product_id)
    do update set updated_at = ${at}::timestamptz, period_key = 'test'`);
}

async function readWindow(tx: Tx): Promise<string | null> {
  const r = (await tx.execute(sql`
    select to_char(updated_at at time zone 'UTC','YYYY-MM-DD') d from shop_purchases
    where user_id=${TEST_USER_ID}::uuid and server_id=${SERVER_ID} and product_id='premium'
  `)) as unknown as { d: string }[];
  return r[0]?.d ?? null;
}

describe.skipIf(skip)('프리미엄 환불 회수 — 주문 단위', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('남은 주문이 만료됐으면 창이 그 시각으로 되돌아가 드립이 멈춘다', async () => {
    await inRollback(async (tx) => {
      // 오래전 주문(살아 있음, 창은 이미 만료) + 최근 주문(방금 환불됨).
      await order(tx, `t_prem_old_${process.pid}`, 'paid', '2026-01-01T00:00:00Z');
      await order(tx, `t_prem_new_${process.pid}`, 'refunded', '2026-09-01T00:00:00Z');
      await setWindow(tx, '2026-09-01T00:00:00Z'); // 환불된 주문이 덮어쓴 창

      await reclaimProductGrant(tx, TEST_USER_ID, SERVER_ID, 'premium', 't');

      // 창이 오래전 주문 시각으로 되돌아간다 → +29일이 이미 지나 드립이 안 나간다.
      expect(await readWindow(tx)).toBe('2026-01-01');
    });
  });

  it('남은 주문이 아직 살아 있으면 그 주문 몫만큼 창이 남는다', async () => {
    await inRollback(async (tx) => {
      const recent = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 3일 전
      await order(tx, `t_prem_live_${process.pid}`, 'paid', recent);
      await order(tx, `t_prem_ref_${process.pid}`, 'refunded', new Date().toISOString());
      await setWindow(tx, new Date().toISOString());

      await reclaimProductGrant(tx, TEST_USER_ID, SERVER_ID, 'premium', 't');

      expect(await readWindow(tx)).toBe(recent.slice(0, 10)); // 3일 전으로 복귀
    });
  });

  it('남은 주문이 없으면 창 자체를 지운다', async () => {
    await inRollback(async (tx) => {
      await order(tx, `t_prem_only_${process.pid}`, 'refunded', '2026-09-01T00:00:00Z');
      await setWindow(tx, '2026-09-01T00:00:00Z');

      await reclaimProductGrant(tx, TEST_USER_ID, SERVER_ID, 'premium', 't');

      expect(await readWindow(tx)).toBeNull();
    });
  });

  it('지급 없이 paid된 주문(grant_skipped)은 권리로 치지 않는다', async () => {
    await inRollback(async (tx) => {
      await order(tx, `t_prem_skip_${process.pid}`, 'paid', '2026-08-01T00:00:00Z');
      await tx.execute(sql`
        update iap_orders set grant_skipped = true
        where portone_order_id = ${`t_prem_skip_${process.pid}`}`);
      await order(tx, `t_prem_r2_${process.pid}`, 'refunded', '2026-09-01T00:00:00Z');
      await setWindow(tx, '2026-09-01T00:00:00Z');

      await reclaimProductGrant(tx, TEST_USER_ID, SERVER_ID, 'premium', 't');

      expect(await readWindow(tx)).toBeNull();
    });
  });
});
