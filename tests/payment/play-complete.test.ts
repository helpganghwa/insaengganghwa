import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 구글 API(play-api)만 mock — 주문·지급·소모 기록·환불 회수는 실제 DB 경로로 검증(complete-refund.test와 같은 방식).
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

import { consumePlayProductPurchase, getPlayProductPurchase, listPlayVoidedPurchases } from '@/lib/payment/play-api';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';
import { syncPlayVoided } from '@/lib/payment/play';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getPlayProductPurchase);
const mockConsume = vi.mocked(consumePlayProductPurchase);
const mockVoided = vi.mocked(listPlayVoidedPurchases);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const PRODUCT = 'starter';
const SKU = 'dia_starter';
const AMOUNT = 1500;
const DIAMOND = 300;

let seq = 0;
const newPid = (tag: string) => `gp-test_${tag}_${++seq}_${process.pid}`;
const newToken = (tag: string) => `tok_${tag}_${seq}_${process.pid}_${Date.now()}`;
const purchased = (orderId = 'GPA.1111') => ({ purchaseState: 0, consumptionState: 0, acknowledgementState: 0, orderId });
const canceled = () => ({ purchaseState: 1, consumptionState: 0, acknowledgementState: 0, orderId: 'GPA.1111' });

async function insertOrder(pid: string): Promise<bigint> {
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${PRODUCT}, ${AMOUNT}::bigint, ${DIAMOND}::bigint, 'pending', 'play', ${SKU})
    returning id::text id`)) as unknown as { id: string }[];
  return BigInt(r[0]!.id);
}
async function readOrder(id: bigint) {
  const r = (await testDb.execute(sql`
    select status::text s, play_purchase_token t, play_order_id o, play_consumed_at c from iap_orders where id = ${id.toString()}::bigint
  `)) as unknown as { s: string; t: string | null; o: string | null; c: string | null }[];
  return r[0]!;
}
async function readDiamond(): Promise<bigint> {
  const r = (await testDb.execute(
    sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`,
  )) as unknown as { d: string }[];
  return BigInt(r[0]?.d ?? '0');
}

describe.skipIf(skip)('Play 결제 — completePurchase/refund/voided 동기화 DB 통합', () => {
  let baseline = 0n;
  const made: bigint[] = [];

  beforeEach(async () => {
    baseline = await readDiamond();
    mockGet.mockReset();
    mockConsume.mockReset();
    mockVoided.mockReset();
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

  it('구매 완료 토큰이면 지급·토큰 바인딩·소모까지 한 번에, 재호출은 already', async () => {
    const pid = newPid('ok');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('ok');
    mockGet.mockResolvedValue(purchased('GPA.ok'));
    mockConsume.mockResolvedValue(undefined);

    const r = await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token });
    expect(r).toEqual({ ok: true, already: false });
    const o = await readOrder(id);
    expect(o.s).toBe('paid');
    expect(o.t).toBe(token);
    expect(o.o).toBe('GPA.ok');
    expect(o.c).not.toBeNull();
    expect(mockConsume).toHaveBeenCalledWith(SKU, token);
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));

    const again = await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token });
    expect(again).toEqual({ ok: true, already: true });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('구매 상태가 아니면(취소·보류) 지급하지 않는다', async () => {
    const pid = newPid('np');
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue({ purchaseState: 2, consumptionState: 0 });
    const r = await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken('np') });
    expect(r).toEqual({ ok: false, code: 'NOT_PAID' });
    expect((await readOrder(id)).s).toBe('pending');
    expect(await readDiamond()).toBe(baseline);
  });

  it('같은 토큰으로 두 번째 주문을 지급하려 하면 TOKEN_USED', async () => {
    const pid1 = newPid('t1');
    const id1 = await insertOrder(pid1);
    made.push(id1);
    const token = newToken('t');
    mockGet.mockResolvedValue(purchased());
    mockConsume.mockResolvedValue(undefined);
    expect((await completePurchase(pid1, TEST_USER_ID, { playPurchaseToken: token })).ok).toBe(true);

    const pid2 = newPid('t2');
    const id2 = await insertOrder(pid2);
    made.push(id2);
    const r = await completePurchase(pid2, TEST_USER_ID, { playPurchaseToken: token });
    expect(r).toEqual({ ok: false, code: 'TOKEN_USED' });
    expect((await readOrder(id2)).s).toBe('pending');
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('소모 실패는 지급을 되돌리지 않고 play_consumed_at만 비워 둔다(cron 재시도)', async () => {
    const pid = newPid('cf');
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue(purchased());
    mockConsume.mockRejectedValue(new Error('boom'));
    const r = await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken('cf') });
    expect(r).toEqual({ ok: true, already: false });
    const o = await readOrder(id);
    expect(o.s).toBe('paid');
    expect(o.c).toBeNull();
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('환불: 구글이 취소됨이면 회수·refunded, 아직 구매완료면 NOT_CANCELLED', async () => {
    const pid = newPid('rf');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('rf');
    mockGet.mockResolvedValue(purchased());
    mockConsume.mockResolvedValue(undefined);
    expect((await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token })).ok).toBe(true);

    mockGet.mockResolvedValue(purchased());
    expect(await refundPurchase(pid)).toEqual({ ok: false, code: 'NOT_CANCELLED' });
    expect((await readOrder(id)).s).toBe('paid');

    mockGet.mockResolvedValue(canceled());
    const r = await refundPurchase(pid);
    expect(r.ok).toBe(true);
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await readDiamond()).toBe(baseline);
  });

  it('voided 동기화: 토큰이 우리 주문이면 환불 처리, 모르는 토큰은 건너뛴다', async () => {
    const pid = newPid('vd');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('vd');
    mockGet.mockResolvedValue(purchased());
    mockConsume.mockResolvedValue(undefined);
    expect((await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token })).ok).toBe(true);

    mockGet.mockResolvedValue(canceled());
    mockVoided.mockResolvedValue([
      { purchaseToken: token, orderId: 'GPA.1111', voidedReason: 1, voidedSource: 0 },
      { purchaseToken: 'unknown-token', orderId: 'GPA.9999' },
    ]);
    const r = await syncPlayVoided();
    expect(r).toMatchObject({ voided: 2, refunded: 1, unknown: 1, failed: 0 });
    expect((await readOrder(id)).s).toBe('refunded');
    expect(await readDiamond()).toBe(baseline);
  });
});

if (!skip) {
  // vitest는 파일 단위로 풀을 닫는다 — 테스트 DB 연결 정리.
  afterEach(() => undefined);
  process.on('beforeExit', () => void endTestDb());
}
