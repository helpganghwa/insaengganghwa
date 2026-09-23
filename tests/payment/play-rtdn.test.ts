import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 구글 API만 mock — 매칭·지급·토큰 바인딩·경보는 실제 DB 경로(스테이징 테스트 계정, afterEach가 전부 되돌림).
vi.mock('@/lib/payment/play-api', () => ({
  playConfigured: () => true,
  playPackageName: () => 'app.ganghwa.game',
  playServiceAccountEmail: () => 'sa@example.iam.gserviceaccount.com',
  getPlayProductPurchase: vi.fn(),
  consumePlayProductPurchase: vi.fn(),
  refundPlayOrder: vi.fn(),
  listPlayVoidedPurchases: vi.fn(),
  getPlayOrder: vi.fn(),
  PlayApiError: class PlayApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { consumePlayProductPurchase, getPlayProductPurchase } from '@/lib/payment/play-api';
import { completePurchase } from '@/lib/payment/purchase';
import { handleOneTimePurchase } from '@/lib/payment/play-rtdn';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

const mockGet = vi.mocked(getPlayProductPurchase);
const mockConsume = vi.mocked(consumePlayProductPurchase);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
// 다른 테스트·스테이징 잔여 주문과 겹치지 않는 SKU(매칭은 SKU별) — 카탈로그에 있는 실 SKU여야 isKnownPlaySku를 통과한다.
const PRODUCT = 'd1';
const SKU = 'cash_d1';
const AMOUNT = 1200;
const DIAMOND = 290;

let seq = 0;
const newPid = (tag: string) => `gp-rtdntest_${tag}_${++seq}_${process.pid}`;
const newToken = (tag: string) => `rtdntok_${tag}_${seq}_${process.pid}_${Date.now()}`;
const purchase = (o: { orderId: string; atMs?: number; purchaseType?: number }) => ({
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  orderId: o.orderId,
  purchaseTimeMillis: String(o.atMs ?? Date.now()),
  ...(o.purchaseType != null ? { purchaseType: o.purchaseType } : {}),
});

async function insertOrder(pid: string, o: { status?: 'pending' | 'expired'; checkoutAgoMs?: number | null } = {}): Promise<bigint> {
  const checkout = o.checkoutAgoMs === null ? null : new Date(Date.now() - (o.checkoutAgoMs ?? 5_000)).toISOString();
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, play_checkout_at)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${PRODUCT}, ${AMOUNT}::bigint, ${DIAMOND}::bigint, ${o.status ?? 'pending'}, 'play', ${SKU}, ${checkout}::timestamptz)
    returning id::text id`)) as unknown as { id: string }[];
  return BigInt(r[0]!.id);
}
async function readOrder(id: bigint) {
  const r = (await testDb.execute(sql`select status::text s, play_purchase_token t from iap_orders where id = ${id.toString()}::bigint`)) as unknown as { s: string; t: string | null }[];
  return r[0]!;
}
async function readDiamond(): Promise<bigint> {
  const r = (await testDb.execute(sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as { d: string }[];
  return BigInt(r[0]?.d ?? '0');
}
async function alertCount(prefix: string): Promise<number> {
  const r = (await testDb.execute(sql`select count(*)::int n from payment_alerts where payment_id like ${prefix + '%'}`)) as unknown as { n: number }[];
  return r[0]!.n;
}

describe.skipIf(skip)('RTDN — 구글 알림으로 주문 매칭·지급(DB 통합)', () => {
  let baseline = 0n;
  const made: bigint[] = [];
  const alertPrefixes: string[] = [];

  beforeEach(async () => {
    baseline = await readDiamond();
    mockGet.mockReset();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const id of made) {
      await testDb.execute(sql`delete from payment_alerts where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from diamond_ledger where user_id = ${TEST_USER_ID}::uuid and ref = ${'order:' + id.toString()}`);
      await testDb.execute(sql`delete from point_ledger where kind = 'mileage' and ref in (${'order:' + id.toString()}, ${'order:' + id.toString() + ':refund'})`);
      await testDb.execute(sql`delete from iap_orders where id = ${id.toString()}::bigint`);
    }
    for (const p of alertPrefixes) await testDb.execute(sql`delete from payment_alerts where payment_id like ${p + '%'}`);
    made.length = 0;
    alertPrefixes.length = 0;
    await resyncTestMileage(TEST_USER_ID);
    await testDb.execute(sql`update characters set diamond = ${baseline.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    await testDb.execute(sql`update monthly_purchase_limits set total_krw = greatest(0, total_krw) where user_id = ${TEST_USER_ID}::uuid`);
  });

  it('결제 시도 직후의 미완 주문 1건 → 그 주문에 지급·토큰 바인딩, 뒤늦은 화면 검증은 already(지급 1회)', async () => {
    const pid = newPid('one');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('one');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-one' }));

    const out = await handleOneTimePurchase(SKU, token);
    expect(out).toMatchObject({ kind: 'granted', paymentId: pid });
    expect(await readOrder(id)).toMatchObject({ s: 'paid', t: token });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));

    const client = await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token });
    expect(client).toEqual({ ok: true, already: true });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));

    // 같은 알림 재전송 — 이미 묶인 토큰이라 already, 추가 지급 없음.
    expect(await handleOneTimePurchase(SKU, token)).toMatchObject({ kind: 'already', paymentId: pid });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('구매자 주문이 만료(expired)돼 있어도 후보 — 그 주문에 지급', async () => {
    const pid = newPid('exp');
    const id = await insertOrder(pid, { status: 'expired' });
    made.push(id);
    const token = newToken('exp');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-exp' }));
    expect(await handleOneTimePurchase(SKU, token)).toMatchObject({ kind: 'granted', paymentId: pid });
    expect((await readOrder(id)).s).toBe('paid');
  });

  it('창 안 후보가 2건이면 아무에게도 지급하지 않고 경보', async () => {
    const a = await insertOrder(newPid('amb-a'));
    const b = await insertOrder(newPid('amb-b'));
    made.push(a, b);
    alertPrefixes.push('rtdn:GPA.rtdn-amb');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-amb' }));
    expect(await handleOneTimePurchase(SKU, newToken('amb'))).toMatchObject({ kind: 'unmatched', candidates: 2 });
    expect((await readOrder(a)).s).toBe('pending');
    expect((await readOrder(b)).s).toBe('pending');
    expect(await readDiamond()).toBe(baseline);
    expect(await alertCount('rtdn:GPA.rtdn-amb')).toBe(1);
  });

  it('결제 시도 시각이 창 밖(20분 전)이거나 없으면 후보가 아니다 → 지급 없음·경보', async () => {
    const old = await insertOrder(newPid('old'), { checkoutAgoMs: 20 * 60_000 });
    const legacy = await insertOrder(newPid('legacy'), { checkoutAgoMs: null });
    made.push(old, legacy);
    alertPrefixes.push('rtdn:GPA.rtdn-none');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-none' }));
    expect(await handleOneTimePurchase(SKU, newToken('none'))).toMatchObject({ kind: 'unmatched', candidates: 0 });
    expect(await readDiamond()).toBe(baseline);
  });

  it('테스트·프로모 구매(purchaseType 0·1)는 후보가 1건이어도 자동 지급하지 않는다', async () => {
    const id = await insertOrder(newPid('promo'));
    made.push(id);
    alertPrefixes.push('rtdn:GPA.rtdn-promo');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-promo', purchaseType: 1 }));
    expect(await handleOneTimePurchase(SKU, newToken('promo'))).toMatchObject({ kind: 'unmatched' });
    expect((await readOrder(id)).s).toBe('pending');
    expect(await readDiamond()).toBe(baseline);
  });

  it('취소·보류된 구매 알림은 무시(지급 없음)', async () => {
    const id = await insertOrder(newPid('cxl'));
    made.push(id);
    mockGet.mockResolvedValue({ ...purchase({ orderId: 'GPA.rtdn-cxl' }), purchaseState: 1 });
    expect(await handleOneTimePurchase(SKU, newToken('cxl'))).toMatchObject({ kind: 'ignored' });
    expect((await readOrder(id)).s).toBe('pending');
  });

  it('이미 지급된 주문에 다른 토큰으로 화면 검증이 오면 성공으로 답하지 않는다', async () => {
    const pid = newPid('mis');
    const id = await insertOrder(pid);
    made.push(id);
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-mis' }));
    expect((await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken('mis1') })).ok).toBe(true);
    expect(await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: newToken('mis2') })).toEqual({ ok: false, code: 'TOKEN_USED' });
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });

  it('알림과 화면 검증이 동시에 와도 지급은 1회', async () => {
    const pid = newPid('race');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('race');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.rtdn-race' }));
    const [a, b] = await Promise.all([
      handleOneTimePurchase(SKU, token),
      completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token }),
    ]);
    expect(a.kind === 'granted' || a.kind === 'already').toBe(true);
    expect(b.ok).toBe(true);
    expect((await readOrder(id)).s).toBe('paid');
    expect((await readDiamond()) - baseline).toBe(BigInt(DIAMOND));
  });
});

process.on('beforeExit', () => void endTestDb());
