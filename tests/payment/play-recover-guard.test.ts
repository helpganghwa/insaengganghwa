import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// 구글 API와 지급 단계(completePurchase·createPlayOrder)를 mock — 상점 복구가 어느 주문으로 가는지(누구에게 지급하는지)만
// 실제 DB 주문으로 판정한다(스테이징, 만든 주문·경보는 끝나면 지움, 재화는 움직이지 않음).
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
vi.mock('@/lib/payment/purchase', () => ({
  completePurchase: vi.fn(),
  createPlayOrder: vi.fn(),
  PurchaseError: class PurchaseError extends Error {},
}));

import { getPlayProductPurchase } from '@/lib/payment/play-api';
import { recoverPlayPurchase } from '@/lib/payment/play-recover';
import { completePurchase, createPlayOrder } from '@/lib/payment/purchase';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getPlayProductPurchase);
const mockComplete = vi.mocked(completePurchase);
const mockCreate = vi.mocked(createPlayOrder);
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
// 거의 팔리지 않는 최고가 SKU — 스테이징에 실제 미완 주문이 섞여 거짓 결과가 나지 않게.
const SKU = 'dia_mega';
let seq = 0;

describe.skipIf(skip)('상점 복구 — 다른 게임 계정의 구매 보호(DB 통합)', () => {
  const made: string[] = [];
  const alertKeys: string[] = [];
  // 테스트 계정 말고 실제로 있는 다른 프로필 하나(주문 FK 때문) — 이 사람 이름으로 만든 테스트 주문은 끝나면 지운다.
  let otherProfile = '';

  beforeAll(async () => {
    const r = (await testDb.execute(sql`select id::text id from profiles where id <> ${TEST_USER_ID}::uuid order by id limit 1`)) as unknown as { id: string }[];
    otherProfile = r[0]!.id;
  });

  afterEach(async () => {
    for (const pid of made) await testDb.execute(sql`delete from iap_orders where portone_order_id = ${pid}`);
    for (const k of alertKeys) await testDb.execute(sql`delete from payment_alerts where payment_id = ${k}`);
    made.length = 0;
    alertKeys.length = 0;
    mockGet.mockReset();
    mockComplete.mockReset();
    mockCreate.mockReset();
    mockComplete.mockResolvedValue({ ok: true, already: false });
  });

  // 토큰 없는 pending 주문. createdAt·checkoutAt은 구매 시각 기준 오프셋(ms, 음수=구매 전).
  async function order(userId: string, pt: number, createdOff: number, checkoutOff: number) {
    const pid = `gp-recguard_${++seq}_${process.pid}`;
    made.push(pid);
    await testDb.execute(sql`
      insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, created_at, play_checkout_at)
      values (1, ${userId}::uuid, ${pid}, 'mega', 68000::bigint, 0::bigint, 'pending', 'play', ${SKU},
        ${new Date(pt + createdOff).toISOString()}::timestamptz, ${new Date(pt + checkoutOff).toISOString()}::timestamptz)`);
    return pid;
  }
  function google(pt: number) {
    const gid = `GPA.recguard-${seq}-${process.pid}`;
    alertKeys.push(`recover:${gid}`);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: gid, purchaseTimeMillis: String(pt) });
    return gid;
  }
  const alertCount = async (gid: string) =>
    ((await testDb.execute(sql`select 1 from payment_alerts where payment_id = ${'recover:' + gid}`)) as unknown as unknown[]).length;

  it('복구 유저의 주문이 없고 다른 유저의 미완 주문이 구매 시각 근처면 지급하지 않고 경보', async () => {
    const pt = Date.now() - 10 * 60_000;
    await order(TEST_USER_ID, pt, -60_000, -60_000);
    const gid = google(pt);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('주인이 결과를 잃고 다시 눌러 결제 시도 시각이 구매 뒤로 밀려도, 다른 계정의 복구는 막는다', async () => {
    const pt = Date.now() - 30 * 60_000;
    await order(TEST_USER_ID, pt, -60_000, 20 * 60_000);
    const gid = google(pt);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('주인 본인은 다시 눌러 시도 시각이 밀린 주문이라도 자기 주문으로 복구된다(남의 오래된 결제창은 무관)', async () => {
    const pt = Date.now() - 30 * 60_000;
    const own = await order(TEST_USER_ID, pt, -60_000, 20 * 60_000);
    await order(otherProfile, pt, -2 * 3_600_000, -2 * 3_600_000);
    const gid = google(pt);
    const tok = `tok-recguard-${seq}`;
    expect(await recoverPlayPurchase(TEST_USER_ID, 1, SKU, tok)).toEqual({ ok: true, already: false, paymentId: own });
    expect(mockComplete).toHaveBeenCalledWith(own, TEST_USER_ID, { playPurchaseToken: tok });
    expect(await alertCount(gid)).toBe(0);
  });

  it('본인과 다른 유저가 둘 다 구매 직전에 결제창을 열었으면 가릴 수 없어 막는다', async () => {
    const pt = Date.now() - 30 * 60_000;
    await order(TEST_USER_ID, pt, -60_000, -60_000);
    await order(otherProfile, pt, -10 * 60_000, -10 * 60_000);
    const gid = google(pt);
    expect(await recoverPlayPurchase(TEST_USER_ID, 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('몇 시간 전 자기 구매(paid)가 있어도 다른 유저의 직전 주문이 있으면 가져가지 않는다(11차 감사 회귀)', async () => {
    const pt = Date.now() - 10 * 60_000;
    const paidPid = await order(TEST_USER_ID, pt, -3 * 3_600_000, -3 * 3_600_000);
    await testDb.execute(sql`update iap_orders set status = 'paid', play_purchase_token = ${'tok-recguard-paid-' + seq + '-' + process.pid} where portone_order_id = ${paidPid}`);
    await order(otherProfile, pt, -60_000, -60_000);
    const gid = google(pt);
    expect(await recoverPlayPurchase(TEST_USER_ID, 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('복구 유저 자신의 주문이 창 밖이고 다른 유저가 구매 직전에 연 주문이 있으면 막는다', async () => {
    const pt = Date.now() - 10 * 60_000;
    await order(TEST_USER_ID, pt, -8 * 3_600_000, -8 * 3_600_000);
    await order(otherProfile, pt, -5 * 60_000, -5 * 60_000);
    const gid = google(pt);
    expect(await recoverPlayPurchase(TEST_USER_ID, 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('다른 유저가 몇 시간 전에 버린 결제창(구매 직전 아님)은 막지 않는다', async () => {
    const pt = Date.now() - 10 * 60_000;
    await order(TEST_USER_ID, pt, -2 * 3_600_000, -2 * 3_600_000);
    const gid = google(pt);
    mockCreate.mockResolvedValue({ paymentId: 'gp-recguard-new2' } as Awaited<ReturnType<typeof createPlayOrder>>);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: true, already: false, paymentId: 'gp-recguard-new2' });
    expect(await alertCount(gid)).toBe(0);
  });

  it('토큰이 다른 유저 주문에 이미 묶였으면 새 주문 없이 끝낸다', async () => {
    const pt = Date.now() - 10 * 60_000;
    const pid = await order(TEST_USER_ID, pt, -60_000, -60_000);
    const tok = `tok-recguard-bound-${seq}-${process.pid}`;
    await testDb.execute(sql`update iap_orders set play_purchase_token = ${tok} where portone_order_id = ${pid}`);
    google(pt);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, tok)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('구매 시각이 없으면 추정 지급하지 않고 경보', async () => {
    const pt = Date.now() - 10 * 60_000;
    await order(TEST_USER_ID, pt, -60_000, -60_000);
    const gid = google(pt);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: gid });
    expect(await recoverPlayPurchase(TEST_USER_ID, 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('다른 유저의 직전 주문이 expired여도 막고, 토큰이 이미 묶인(끝난) 주문이면 막지 않는다', async () => {
    const pt = Date.now() - 10 * 60_000;
    const exp = await order(TEST_USER_ID, pt, -60_000, -60_000);
    await testDb.execute(sql`update iap_orders set status = 'expired' where portone_order_id = ${exp}`);
    const gid = google(pt);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await alertCount(gid)).toBe(1);

    await testDb.execute(sql`update iap_orders set status = 'paid', play_purchase_token = ${'tok-recguard-done-' + seq + '-' + process.pid} where portone_order_id = ${exp}`);
    seq++; // 다른 구글 주문번호로
    const gid2 = google(pt);
    mockCreate.mockResolvedValue({ paymentId: 'gp-recguard-new3' } as Awaited<ReturnType<typeof createPlayOrder>>);
    expect(await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}-b`)).toEqual({ ok: true, already: false, paymentId: 'gp-recguard-new3' });
    expect(await alertCount(gid2)).toBe(0);
  });

  it('다른 유저의 미완 주문이 구매 시각 창 밖이면 막지 않는다(새 주문으로 복구, 경보 없음)', async () => {
    const pt = Date.now() - 10 * 60_000;
    await order(TEST_USER_ID, pt, -8 * 3_600_000, -8 * 3_600_000);
    const gid = google(pt);
    mockCreate.mockResolvedValue({ paymentId: 'gp-recguard-new' } as Awaited<ReturnType<typeof createPlayOrder>>);
    const other = randomUUID();
    expect(await recoverPlayPurchase(other, 1, SKU, `tok-recguard-${seq}`)).toEqual({ ok: true, already: false, paymentId: 'gp-recguard-new' });
    expect(await alertCount(gid)).toBe(0);
  });
});

process.on('beforeExit', () => void endTestDb());
