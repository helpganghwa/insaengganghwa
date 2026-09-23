import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 구글 API만 mock — 중복 결제 자동 환불이 실제 DB에서 지급 없이 환불로 마감되는지(스테이징 테스트 계정, 끝나면 되돌림).
vi.mock('@/lib/payment/play-api', () => ({
  playConfigured: () => true,
  playPackageName: () => 'app.ganghwa.game',
  getPlayProductPurchase: vi.fn(),
  consumePlayProductPurchase: vi.fn(),
  refundPlayOrder: vi.fn(),
  listPlayVoidedPurchases: vi.fn(),
  PlayApiError: class PlayApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { consumePlayProductPurchase, getPlayProductPurchase, refundPlayOrder } from '@/lib/payment/play-api';
import { completePurchase } from '@/lib/payment/purchase';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

const mockGet = vi.mocked(getPlayProductPurchase);
const mockConsume = vi.mocked(consumePlayProductPurchase);
const mockRefund = vi.mocked(refundPlayOrder);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const PRODUCT = 'first_special';
const SKU = 'first_special';

let seq = 0;
const newPid = () => `gp-duptest_${++seq}_${process.pid}`;
const newToken = () => `duptok_${seq}_${process.pid}_${Date.now()}`;

async function insertOrder(pid: string): Promise<bigint> {
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, play_checkout_at)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${PRODUCT}, 1000::bigint, 0::bigint, 'pending', 'play', ${SKU}, now())
    returning id::text id`)) as unknown as { id: string }[];
  return BigInt(r[0]!.id);
}
async function readOrder(id: bigint) {
  const r = (await testDb.execute(sql`select status::text s, grant_skipped g, play_consumed_at c from iap_orders where id = ${id.toString()}::bigint`)) as unknown as { s: string; g: boolean; c: string | null }[];
  return r[0]!;
}
const readDiamond = async () =>
  BigInt(((await testDb.execute(sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as { d: string }[])[0]?.d ?? '0');
const readMonthly = async () =>
  ((await testDb.execute(sql`select kst_month, total_krw::text t from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { kst_month: string; t: string }[]);

describe.skipIf(skip)('중복 결제(1회 특가) — 지급 차단 후 즉시 자동 환불(DB 통합)', () => {
  let baseline = 0n;
  let monthly: { kst_month: string; t: string }[] = [];
  let onceRow: { period_key: string } | undefined;
  const made: bigint[] = [];

  beforeEach(async () => {
    baseline = await readDiamond();
    monthly = await readMonthly();
    onceRow = ((await testDb.execute(sql`select period_key from shop_purchases where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and product_id = ${PRODUCT}`)) as unknown as { period_key: string }[])[0];
    // 이미 산 것으로 만든다 — 다음 결제가 중복이 된다.
    await testDb.execute(sql`insert into shop_purchases (user_id, server_id, product_id, period_key) values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${PRODUCT}, 'once')
      on conflict (user_id, server_id, product_id) do update set period_key = 'once'`);
    mockGet.mockReset();
    mockConsume.mockReset();
    mockRefund.mockReset();
    mockConsume.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const id of made) {
      await testDb.execute(sql`delete from payment_alerts where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from iap_refunds where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from point_ledger where kind = 'mileage' and ref in (${'order:' + id.toString()}, ${'order:' + id.toString() + ':refund'})`);
      await testDb.execute(sql`delete from iap_orders where id = ${id.toString()}::bigint`);
    }
    made.length = 0;
    await testDb.execute(sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and title = '결제 환불 안내' and created_at > now() - interval '5 minutes'`);
    await testDb.execute(sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`);
    for (const m of monthly) await testDb.execute(sql`insert into monthly_purchase_limits (user_id, kst_month, total_krw) values (${TEST_USER_ID}::uuid, ${m.kst_month}, ${m.t}::bigint)`);
    if (onceRow) await testDb.execute(sql`update shop_purchases set period_key = ${onceRow.period_key} where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and product_id = ${PRODUCT}`);
    else await testDb.execute(sql`delete from shop_purchases where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and product_id = ${PRODUCT}`);
    await resyncTestMileage(TEST_USER_ID);
    await testDb.execute(sql`update characters set diamond = ${baseline.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
  });

  it('중복이면 지급 없이 구글 환불 → 주문 refunded, 소모하지 않음', async () => {
    const pid = newPid();
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: 'GPA.dup-ok' });
    mockRefund.mockResolvedValue(undefined);
    await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken() });
    expect(mockRefund).toHaveBeenCalledWith('GPA.dup-ok', true);
    const o = await readOrder(id);
    expect(o.s).toBe('refunded');
    expect(o.g).toBe(true);
    expect(o.c).toBeNull();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(await readDiamond()).toBe(baseline);
    // 환불 확정 주문에 재검증이 와도 재지급 없이 REFUNDED.
    expect(await completePurchase(pid, TEST_USER_ID)).toEqual({ ok: false, code: 'REFUNDED' });
  });

  it('구글 환불 API가 실패하면 paid·지급보류·미소모로 남기고 경보(3일 자동 환불이 안전망)', async () => {
    const pid = newPid();
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: 'GPA.dup-fail' });
    mockRefund.mockRejectedValue(new Error('boom'));
    await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken() });
    const o = await readOrder(id);
    expect(o.s).toBe('paid');
    expect(o.g).toBe(true);
    expect(o.c).toBeNull();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(await readDiamond()).toBe(baseline);
    const a = (await testDb.execute(sql`select kind from payment_alerts where order_id = ${id.toString()}::bigint`)) as unknown as { kind: string }[];
    expect(a.map((x) => x.kind)).toContain('REFUND_RECLAIM_FAILED');
    // 다시 확인해도(웹훅·화면 재검증) '구매 완료'로 답하지 않는다.
    expect(await completePurchase(pid, TEST_USER_ID)).toEqual({ ok: false, code: 'NOT_GRANTED' });
  });
});

process.on('beforeExit', () => void endTestDb());
