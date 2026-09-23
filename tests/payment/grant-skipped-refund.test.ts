import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 구글 API만 mock — 정산 크론 C단계(지급 보류 결제 환불 재시도)가 실제 DB에서 어떻게 마감되는지(스테이징 테스트 계정, 끝나면 되돌림).
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
import { retryGrantSkippedRefund } from '@/lib/payment/grant-skipped-refund';
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
const newPid = () => `gp-gsretry_${++seq}_${process.pid}`;
const newToken = () => `gsrtok_${seq}_${process.pid}_${Date.now()}`;

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

describe.skipIf(skip)('지급 보류 Play 결제 — 환불 재시도(정산 C단계, DB 통합)', () => {
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

  // 인라인 자동 환불이 실패해 paid·지급 보류로 남은 중복 결제를 만든다(함수가 죽은 경우와 같은 상태).
  async function stuckOrder(googleOrderId: string) {
    const pid = newPid();
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: googleOrderId });
    mockRefund.mockRejectedValueOnce(new Error('boom'));
    await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken() });
    const r = (await testDb.execute(sql`select play_order_id from iap_orders where id = ${id.toString()}::bigint`)) as unknown as { play_order_id: string | null }[];
    expect(r[0]!.play_order_id).toBe(googleOrderId);
    expect((await readOrder(id)).s).toBe('paid');
    mockRefund.mockReset();
    return { pid, id, o: { id, pid, provider: 'play', playOrderId: googleOrderId } };
  }
  const skippedAlerts = async (pid: string) =>
    (await testDb.execute(sql`select detail from payment_alerts where payment_id = ${'skipped-refund:' + pid}`)) as unknown as { detail: string }[];

  it('구글에서 아직 구매 완료면 환불 API를 부르고 환불로 마감', async () => {
    const { pid, id, o } = await stuckOrder('GPA.gs-live');
    mockRefund.mockResolvedValue(undefined);
    expect(await retryGrantSkippedRefund(o)).toBe(true);
    expect(mockRefund).toHaveBeenCalledWith('GPA.gs-live', true);
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await readDiamond()).toBe(baseline);
    expect(await skippedAlerts(pid)).toHaveLength(0);
  });

  it('구글에서 이미 환불됐으면 환불 API 없이 마감(거짓 경보 없음)', async () => {
    const { pid, id, o } = await stuckOrder('GPA.gs-done');
    mockGet.mockResolvedValue({ purchaseState: 1, consumptionState: 0, orderId: 'GPA.gs-done' });
    expect(await retryGrantSkippedRefund(o)).toBe(true);
    expect(mockRefund).not.toHaveBeenCalled();
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await skippedAlerts(pid)).toHaveLength(0);
  });

  it('미성년 한도 건이면 환불 사유를 minor_protection으로 남긴다', async () => {
    const { pid, id, o } = await stuckOrder('GPA.gs-minor');
    // 미성년 지급 보류 때 남는 경보를 흉내 낸다(정리는 order_id로 함께 지워진다).
    await testDb.execute(sql`insert into payment_alerts (kind, severity, payment_id, order_id, detail) values ('MINOR_LIMIT_EXCEEDED', 'high', ${pid}, ${id.toString()}::bigint, 'test')`);
    mockRefund.mockResolvedValue(undefined);
    expect(await retryGrantSkippedRefund(o)).toBe(true);
    const r = (await testDb.execute(sql`select reason::text reason from iap_refunds where order_id = ${id.toString()}::bigint`)) as unknown as { reason: string }[];
    expect(r.map((x) => x.reason)).toEqual(['minor_protection']);
  });

  it('환불 API가 또 실패하면 paid로 두고 콘솔 환불 경보 1회', async () => {
    const { pid, id, o } = await stuckOrder('GPA.gs-fail');
    mockRefund.mockRejectedValue(new Error('boom'));
    expect(await retryGrantSkippedRefund(o)).toBe(false);
    expect(await retryGrantSkippedRefund(o)).toBe(false);
    expect((await readOrder(id)).s).toBe('paid');
    const a = await skippedAlerts(pid);
    expect(a).toHaveLength(1);
    expect(a[0]!.detail).toContain('콘솔에서 환불 필요');
    expect(mockConsume).not.toHaveBeenCalled();
  });
});

process.on('beforeExit', () => void endTestDb());
