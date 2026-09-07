import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Apple API(apple-api)만 mock — 주문·지급·거래 바인딩·환불 회수는 실제 DB 경로로 검증(play-complete.test와 같은 방식).
vi.mock('@/lib/payment/apple-api', () => ({
  appleConfigured: () => true,
  appleBundleId: () => 'app.ganghwa.game',
  getAppleTransaction: vi.fn(),
  AppleApiError: class AppleApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
// 결제 알림은 외부 발송을 막고 호출만 기록.
vi.mock('@/lib/payment/alert', () => ({ raisePaymentAlert: vi.fn(async () => undefined) }));

import { getAppleTransaction } from '@/lib/payment/apple-api';
import { raisePaymentAlert } from '@/lib/payment/alert';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';
import { syncAppleRevoked } from '@/lib/payment/apple';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getAppleTransaction);
const mockAlert = vi.mocked(raisePaymentAlert);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const PRODUCT = 'starter';
const STORE_PRODUCT = 'dia_starter';
const AMOUNT = 1500;
const DIAMOND = 300;

let seq = 0;
const uuid = () => crypto.randomUUID();
let txnSeq = 3_000_000_000_000_000;
const newTxn = () => String(++txnSeq);

const txn = (id: string, token: string, extra: Partial<Parameters<typeof checkShape>[0]> = {}) => ({
  transactionId: id,
  originalTransactionId: id,
  bundleId: 'app.ganghwa.game',
  productId: STORE_PRODUCT,
  environment: 'Production',
  appAccountToken: token,
  type: 'Consumable',
  ...extra,
});
// 타입 힌트용(런타임 무의미).
function checkShape(t: { revocationDate?: number; environment?: string; productId?: string; appAccountToken?: string }) {
  return t;
}

async function insertOrder(token: string): Promise<{ id: bigint; pid: string }> {
  const pid = `ap-${token}`;
  seq++;
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, apple_product_id)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${PRODUCT}, ${AMOUNT}::bigint, ${DIAMOND}::bigint, 'pending', 'apple', ${STORE_PRODUCT})
    returning id::text id`)) as unknown as { id: string }[];
  return { id: BigInt(r[0]!.id), pid };
}
async function readOrder(id: bigint) {
  const r = (await testDb.execute(sql`
    select status::text s, apple_transaction_id t, apple_original_transaction_id o, apple_environment e from iap_orders where id = ${id.toString()}::bigint
  `)) as unknown as { s: string; t: string | null; o: string | null; e: string | null }[];
  return r[0]!;
}
async function readDiamond(): Promise<bigint> {
  const r = (await testDb.execute(
    sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`,
  )) as unknown as { d: string }[];
  return BigInt(r[0]?.d ?? '0');
}

describe.skipIf(skip)('Apple 결제 — completePurchase/refund/revoked 동기화 DB 통합', () => {
  let baseline = 0n;
  const made: bigint[] = [];

  beforeEach(async () => {
    baseline = await readDiamond();
    mockGet.mockReset();
    mockAlert.mockClear();
    delete process.env.APPLE_ALLOW_SANDBOX;
  });

  afterEach(async () => {
    for (const id of made) {
      await testDb.execute(sql`delete from iap_refunds where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from diamond_ledger where user_id = ${TEST_USER_ID}::uuid and ref = ${'order:' + id.toString()}`).catch(() => undefined);
      await testDb.execute(sql`delete from iap_orders where id = ${id.toString()}::bigint`);
    }
    made.length = 0;
    await testDb.execute(sql`update characters set diamond = ${baseline.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    await testDb.execute(sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and title = '결제 환불 안내' and created_at > now() - interval '2 minutes'`);
    await testDb.execute(sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid and total_krw <= 0`);
  });

  it('Production 거래가 주문과 맞으면 지급·거래 바인딩, 재호출은 already', async () => {
    const token = uuid();
    const { id, pid } = await insertOrder(token);
    made.push(id);
    const t = newTxn();
    mockGet.mockResolvedValue(txn(t, token));

    const r = await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t });
    expect(r).toEqual({ ok: true, already: false });
    const o = await readOrder(id);
    expect(o.s).toBe('paid');
    expect(o.t).toBe(t);
    expect(o.o).toBe(t);
    expect(o.e).toBe('Production');
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));

    const again = await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t });
    expect(again).toEqual({ ok: true, already: true });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('appAccountToken이 다른 주문의 것이면 지급하지 않고 알림', async () => {
    const { id, pid } = await insertOrder(uuid());
    made.push(id);
    mockGet.mockResolvedValue(txn(newTxn(), uuid()));
    const r = await completePurchase(pid, TEST_USER_ID, { appleTransactionId: newTxn() });
    expect(r).toEqual({ ok: false, code: 'NOT_PAID' });
    expect((await readOrder(id)).s).toBe('pending');
    expect(await readDiamond()).toBe(baseline);
    expect(mockAlert).toHaveBeenCalledWith('AMOUNT_MISMATCH', expect.objectContaining({ paymentId: pid }));
  });

  it('환불된 거래·다른 상품 거래는 지급하지 않는다', async () => {
    const token = uuid();
    const { id, pid } = await insertOrder(token);
    made.push(id);
    mockGet.mockResolvedValue(txn(newTxn(), token, { revocationDate: Date.now() }));
    expect(await completePurchase(pid, TEST_USER_ID, { appleTransactionId: newTxn() })).toEqual({ ok: false, code: 'NOT_PAID' });
    mockGet.mockResolvedValue(txn(newTxn(), token, { productId: 'dia_mega' }));
    expect(await completePurchase(pid, TEST_USER_ID, { appleTransactionId: newTxn() })).toEqual({ ok: false, code: 'NOT_PAID' });
    expect((await readOrder(id)).s).toBe('pending');
    expect(await readDiamond()).toBe(baseline);
  });

  it('Sandbox 거래는 일반 계정이면 거부, APPLE_ALLOW_SANDBOX=1이면 지급', async () => {
    const token = uuid();
    const { id, pid } = await insertOrder(token);
    made.push(id);
    const t = newTxn();
    mockGet.mockResolvedValue(txn(t, token, { environment: 'Sandbox' }));
    expect(await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t })).toEqual({ ok: false, code: 'NOT_PAID' });
    expect((await readOrder(id)).s).toBe('pending');

    process.env.APPLE_ALLOW_SANDBOX = '1';
    expect(await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t })).toEqual({ ok: true, already: false });
    expect((await readOrder(id)).e).toBe('Sandbox');
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('같은 거래 ID로 두 번째 주문을 지급하려 하면 TOKEN_USED', async () => {
    const token1 = uuid();
    const o1 = await insertOrder(token1);
    made.push(o1.id);
    const t = newTxn();
    mockGet.mockResolvedValue(txn(t, token1));
    expect((await completePurchase(o1.pid, TEST_USER_ID, { appleTransactionId: t })).ok).toBe(true);

    const o2 = await insertOrder(uuid());
    made.push(o2.id);
    const r = await completePurchase(o2.pid, TEST_USER_ID, { appleTransactionId: t });
    expect(r).toEqual({ ok: false, code: 'TOKEN_USED' });
    expect((await readOrder(o2.id)).s).toBe('pending');
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('환불: 거래에 revocationDate가 생기면 회수·refunded, 없으면 NOT_CANCELLED', async () => {
    const token = uuid();
    const { id, pid } = await insertOrder(token);
    made.push(id);
    const t = newTxn();
    mockGet.mockResolvedValue(txn(t, token));
    expect((await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t })).ok).toBe(true);

    expect(await refundPurchase(pid)).toEqual({ ok: false, code: 'NOT_CANCELLED' });
    expect((await readOrder(id)).s).toBe('paid');

    mockGet.mockResolvedValue(txn(t, token, { revocationDate: Date.now() }));
    const r = await refundPurchase(pid);
    expect(r.ok).toBe(true);
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await readDiamond()).toBe(baseline);
  });

  it('revoked 동기화: paid 주문을 재조회해 환불된 것만 회수한다', async () => {
    const token = uuid();
    const { id, pid } = await insertOrder(token);
    made.push(id);
    const t = newTxn();
    mockGet.mockResolvedValue(txn(t, token));
    expect((await completePurchase(pid, TEST_USER_ID, { appleTransactionId: t })).ok).toBe(true);

    mockGet.mockImplementation(async (transactionId: string) =>
      transactionId === t ? txn(t, token, { revocationDate: Date.now() }) : txn(transactionId, uuid()),
    );
    const r = await syncAppleRevoked();
    expect(r.failed).toBe(0);
    expect(r.refunded).toBeGreaterThanOrEqual(1);
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await readDiamond()).toBe(baseline);
  });
});

if (!skip) {
  afterEach(() => undefined);
  process.on('beforeExit', () => void endTestDb());
}
