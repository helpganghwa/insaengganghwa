import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 구글 API만 mock — 판정·지급·환불 마감·우편·경보는 실제 DB 경로(스테이징 테스트 계정, afterEach가 되돌림).
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
// createPlayOrder의 세션 의존(심사 계정·이메일)만 고정 — 요청 컨텍스트 밖이라 쿠키를 읽을 수 없다.
vi.mock('@/lib/auth/session', () => ({
  isReviewerAccount: async () => false,
  getSessionEmail: async () => null,
}));

import { consumePlayProductPurchase, getPlayProductPurchase, refundPlayOrder } from '@/lib/payment/play-api';
import { decideAttribution, playAccountId } from '@/lib/payment/play-ids';
import { DUPLICATE_REFUND_NOTICE } from '@/lib/payment/play-attribution';
import { handleOneTimePurchase } from '@/lib/payment/play-rtdn';
import { recoverPlayPurchase } from '@/lib/payment/play-recover';
import { completePurchase, createPlayOrder } from '@/lib/payment/purchase';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

describe('결제 귀속 표식 — 순수 규칙', () => {
  it('계정 표식: 결정적·43자·base64url·유저마다 다름', () => {
    const a = playAccountId('00000000-0000-0000-0000-000000000001');
    expect(a).toBe(playAccountId('00000000-0000-0000-0000-000000000001'));
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(playAccountId('00000000-0000-0000-0000-000000000002'));
  });
  const U = 'u-1';
  const base = { userId: U, provider: 'play', playSku: 'cash_d1', status: 'pending', token: null as string | null };
  const p = { sku: 'cash_d1', accountId: playAccountId(U), token: 'T1' };
  it('미완 주문(토큰 없음·같은 토큰·만료) → grant', () => {
    expect(decideAttribution(base, p)).toBe('grant');
    expect(decideAttribution({ ...base, token: 'T1' }, p)).toBe('grant');
    expect(decideAttribution({ ...base, status: 'expired' }, p)).toBe('grant');
  });
  it('같은 토큰으로 끝난 주문 → already', () => {
    expect(decideAttribution({ ...base, status: 'paid', token: 'T1' }, p)).toBe('already');
    expect(decideAttribution({ ...base, status: 'refunded', token: 'T1' }, p)).toBe('already');
  });
  it('다른 토큰으로 지급·환불됐거나 다른 토큰이 묶인 주문 → duplicate', () => {
    expect(decideAttribution({ ...base, status: 'paid', token: 'T0' }, p)).toBe('duplicate');
    expect(decideAttribution({ ...base, status: 'refunded', token: 'T0' }, p)).toBe('duplicate');
    expect(decideAttribution({ ...base, token: 'T0' }, p)).toBe('duplicate');
  });
  it('주문 없음·다른 결제수단·다른 상품·계정 불일치 → mismatch', () => {
    expect(decideAttribution(null, p)).toBe('mismatch');
    expect(decideAttribution({ ...base, provider: 'portone' }, p)).toBe('mismatch');
    expect(decideAttribution({ ...base, playSku: 'cash_d2' }, p)).toBe('mismatch');
    expect(decideAttribution(base, { ...p, accountId: playAccountId('u-2') })).toBe('mismatch');
  });
});

const mockGet = vi.mocked(getPlayProductPurchase);
const mockConsume = vi.mocked(consumePlayProductPurchase);
const mockRefund = vi.mocked(refundPlayOrder);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
const PRODUCT = 'd1';
const SKU = 'cash_d1';
const AMOUNT = 1200;
const DIAMOND = 290;
const OTHER_USER = '00000000-0000-4000-8000-00000000a77b'; // 요청자만 다른 계정(주문 주인 아님)

let seq = 0;
const newPid = (tag: string) => `gp-attrtest_${tag}_${++seq}_${process.pid}`;
const newToken = (tag: string) => `attrtok_${tag}_${seq}_${process.pid}_${Date.now()}`;
const purchase = (o: { orderId: string; profileId: string; accountId?: string; state?: number; purchaseType?: number; atMs?: number }) => ({
  purchaseState: o.state ?? 0,
  consumptionState: 0,
  acknowledgementState: 0,
  orderId: o.orderId,
  purchaseTimeMillis: String(o.atMs ?? Date.now() - 10_000), // 10초 전 — 종전 RTDN 유예(3분) 안
  obfuscatedExternalAccountId: o.accountId ?? playAccountId(TEST_USER_ID),
  obfuscatedExternalProfileId: o.profileId,
  ...(o.purchaseType != null ? { purchaseType: o.purchaseType } : {}),
});

async function insertOrder(pid: string, o: { status?: string; token?: string | null; product?: string; sku?: string } = {}): Promise<bigint> {
  const paid = o.status === 'paid';
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, play_checkout_at, play_purchase_token, paid_at)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${o.product ?? PRODUCT}, ${AMOUNT}::bigint, ${DIAMOND}::bigint, ${o.status ?? 'pending'}, 'play', ${o.sku ?? SKU}, now(), ${o.token ?? null}, ${paid ? sql`now()` : null})
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
async function readMonthly(): Promise<bigint> {
  const r = (await testDb.execute(sql`select coalesce(sum(total_krw), 0)::text t from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { t: string }[];
  return BigInt(r[0]!.t);
}
async function alertCount(prefix: string): Promise<number> {
  const r = (await testDb.execute(sql`select count(*)::int n from payment_alerts where payment_id like ${prefix + '%'}`)) as unknown as { n: number }[];
  return r[0]!.n;
}

describe.skipIf(skip)('결제 귀속 표식 — RTDN·복구·검증(DB 통합)', () => {
  let baselineDiamond = 0n;
  let baselineMonthly: { kst_month: string; total_krw: string }[] = [];
  const made: bigint[] = [];
  const tokens: string[] = [];
  const alertPrefixes: string[] = [];

  beforeEach(async () => {
    baselineDiamond = await readDiamond();
    baselineMonthly = (await testDb.execute(sql`select kst_month, total_krw::text from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { kst_month: string; total_krw: string }[];
    mockGet.mockReset();
    mockConsume.mockReset();
    mockConsume.mockResolvedValue(undefined);
    mockRefund.mockReset();
    mockRefund.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // 중복 환불이 새로 만든 주문 행(토큰으로 찾는다)까지 함께 정리한다.
    for (const t of tokens) {
      const r = (await testDb.execute(sql`select id::text id from iap_orders where play_purchase_token = ${t}`)) as unknown as { id: string }[];
      for (const x of r) if (!made.includes(BigInt(x.id))) made.push(BigInt(x.id));
    }
    for (const id of made) {
      const ref = 'order:' + id.toString();
      await testDb.execute(sql`delete from payment_alerts where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from iap_refunds where order_id = ${id.toString()}::bigint`);
      await testDb.execute(sql`delete from diamond_ledger where user_id = ${TEST_USER_ID}::uuid and ref like ${ref + '%'}`);
      await testDb.execute(sql`delete from point_ledger where kind = 'mileage' and ref in (${ref}, ${ref + ':refund'})`);
      await testDb.execute(sql`delete from iap_orders where id = ${id.toString()}::bigint`);
    }
    for (const p of alertPrefixes) await testDb.execute(sql`delete from payment_alerts where payment_id like ${p + '%'}`);
    await testDb.execute(sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and title in (${DUPLICATE_REFUND_NOTICE.title}, '결제 환불 안내') and created_at > now() - interval '10 minutes'`);
    made.length = 0;
    tokens.length = 0;
    alertPrefixes.length = 0;
    await resyncTestMileage(TEST_USER_ID);
    await testDb.execute(sql`update characters set diamond = ${baselineDiamond.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    for (const m of baselineMonthly) {
      await testDb.execute(sql`update monthly_purchase_limits set total_krw = ${m.total_krw}::bigint where user_id = ${TEST_USER_ID}::uuid and kst_month = ${m.kst_month}`);
    }
    await testDb.execute(sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid and kst_month not in (${sql.join([...baselineMonthly.map((m) => sql`${m.kst_month}`), sql`''`], sql`, `)})`);
  });

  afterAll(async () => {
    await endTestDb();
  });

  it('표식이 가리키는 미완 주문 → 유예 없이 즉시 지급, 테스트 결제 유형도 허용, 뒤늦은 화면 검증은 already', async () => {
    const pid = newPid('grant');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('grant');
    tokens.push(token);
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-grant', profileId: pid, purchaseType: 0 }));

    const out = await handleOneTimePurchase(SKU, token);
    expect(out).toMatchObject({ kind: 'attributed', outcome: { kind: 'granted', paymentId: pid, already: false } });
    expect(await readOrder(id)).toMatchObject({ s: 'paid', t: token });
    expect((await readDiamond()) - baselineDiamond).toBe(BigInt(DIAMOND));

    expect(await completePurchase(pid, TEST_USER_ID, { playPurchaseToken: token })).toEqual({ ok: true, already: true });
    expect(await handleOneTimePurchase(SKU, token)).toMatchObject({ kind: 'already', paymentId: pid });
    expect((await readDiamond()) - baselineDiamond).toBe(BigInt(DIAMOND));
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('계정 표식이 주문 주인과 다르면 → 지급하지 않고 자동 환불 + 경보, 주문은 그대로', async () => {
    const pid = newPid('acct');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('acct');
    tokens.push(token);
    alertPrefixes.push('attr:GPA.attr-acct');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-acct', profileId: pid, accountId: playAccountId(OTHER_USER) }));

    const out = await handleOneTimePurchase(SKU, token);
    expect(out).toMatchObject({ kind: 'attributed', outcome: { kind: 'refunded', reason: 'mismatch' } });
    expect(mockRefund).toHaveBeenCalledWith('GPA.attr-acct', true);
    expect(await readOrder(id)).toMatchObject({ s: 'pending', t: null });
    expect(await readDiamond()).toBe(baselineDiamond);
    expect(await alertCount('attr:GPA.attr-acct')).toBe(1);
  });

  it('표식의 주문이 없으면 → 자동 환불 + 경보', async () => {
    const token = newToken('none');
    tokens.push(token);
    alertPrefixes.push('attr:GPA.attr-none');
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-none', profileId: newPid('ghost') }));
    const out = await handleOneTimePurchase(SKU, token);
    expect(out).toMatchObject({ kind: 'attributed', outcome: { kind: 'refunded', reason: 'mismatch' } });
    expect(mockRefund).toHaveBeenCalledWith('GPA.attr-none', true);
    expect(await alertCount('attr:GPA.attr-none')).toBe(1);
  });

  it('이미 다른 토큰으로 지급된 주문에 또 결제 → 중복 청구 자동 환불: 지급 보류 행·환불 기록·우편, 재화·월누적은 그대로', async () => {
    const pid = newPid('dup');
    const first = newToken('dup-first');
    const id = await insertOrder(pid, { status: 'paid', token: first });
    made.push(id);
    tokens.push(first);
    const second = newToken('dup-second');
    tokens.push(second);
    const monthlyBefore = await readMonthly();
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-dup', profileId: pid }));

    const out = await handleOneTimePurchase(SKU, second);
    expect(out).toMatchObject({ kind: 'attributed', outcome: { kind: 'refunded', reason: 'duplicate' } });
    expect(mockRefund).toHaveBeenCalledWith('GPA.attr-dup', true);
    expect(await readOrder(id)).toMatchObject({ s: 'paid', t: first }); // 원래 주문은 건드리지 않는다
    const row = (await testDb.execute(sql`
      select o.status::text s, o.grant_skipped g, o.play_order_id oid, (select count(*)::int from iap_refunds r where r.order_id = o.id) refunds
      from iap_orders o where o.play_purchase_token = ${second}`)) as unknown as { s: string; g: boolean; oid: string; refunds: number }[];
    expect(row[0]).toMatchObject({ s: 'refunded', g: true, oid: 'GPA.attr-dup', refunds: 1 });
    const mail = (await testDb.execute(sql`select count(*)::int n from mailbox where user_id = ${TEST_USER_ID}::uuid and title = ${DUPLICATE_REFUND_NOTICE.title} and created_at > now() - interval '1 minute'`)) as unknown as { n: number }[];
    expect(mail[0]!.n).toBe(1);
    expect(await readDiamond()).toBe(baselineDiamond);
    expect(await readMonthly()).toBe(monthlyBefore);

    // 같은 알림 재전송 — 토큰이 이미 환불 행에 묶여 already, 환불을 다시 부르지 않는다.
    mockRefund.mockClear();
    expect(await handleOneTimePurchase(SKU, second)).toMatchObject({ kind: 'already' });
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('중복 환불 호출이 실패하면 지급 보류 행만 남고, 이후 상점 복구는 환불됨이 아니라 NO_ORDER(기기 소모 금지)', async () => {
    const pid = newPid('dupfail');
    const first = newToken('dupfail-first');
    const id = await insertOrder(pid, { status: 'paid', token: first });
    made.push(id);
    tokens.push(first);
    const second = newToken('dupfail-second');
    tokens.push(second);
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-dupfail', profileId: pid }));
    mockRefund.mockRejectedValueOnce(new Error('boom'));

    const out = await handleOneTimePurchase(SKU, second);
    expect(out).toMatchObject({ kind: 'attributed', outcome: { kind: 'refund_failed', reason: 'duplicate' } });
    const row = (await testDb.execute(sql`select status::text s, grant_skipped g, portone_order_id pid from iap_orders where play_purchase_token = ${second}`)) as unknown as { s: string; g: boolean; pid: string }[];
    expect(row[0]).toMatchObject({ s: 'paid', g: true }); // 정산 크론 C단계가 다시 환불할 행
    alertPrefixes.push(row[0]!.pid); // 환불 실패 경보는 새 행의 주문번호로 남는다 — 그 한 건만 지운다

    // 상점 복구(표식 경로) — 행이 이미 있어도 환불 확정이 아니므로 CANCELLED(기기 소모)로 답하면 안 된다.
    expect(await recoverPlayPurchase(TEST_USER_ID, SERVER_ID, SKU, second)).toEqual({ ok: false, code: 'NO_ORDER' });
    expect(await readDiamond()).toBe(baselineDiamond);
  });

  it('화면 검증: 구매 표식이 다른 주문을 가리키면 ORDER_MISMATCH — 토큰을 묶지 않는다', async () => {
    const a = newPid('va');
    const b = newPid('vb');
    const ida = await insertOrder(a);
    const idb = await insertOrder(b);
    made.push(ida, idb);
    const token = newToken('v');
    tokens.push(token);
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-v', profileId: b }));
    expect(await completePurchase(a, TEST_USER_ID, { playPurchaseToken: token })).toEqual({ ok: false, code: 'ORDER_MISMATCH' });
    expect(await readOrder(ida)).toMatchObject({ s: 'pending', t: null });
    // 정확한 주문으로는 지급된다.
    expect(await completePurchase(b, TEST_USER_ID, { playPurchaseToken: token })).toEqual({ ok: true, already: false });
  });

  it('상점 복구: 같은 기기의 다른 게임 계정이 요청해도 주문 주인에게 지급하고 요청자에겐 OTHER_ACCOUNT', async () => {
    const pid = newPid('rec');
    const id = await insertOrder(pid);
    made.push(id);
    const token = newToken('rec');
    tokens.push(token);
    mockGet.mockResolvedValue(purchase({ orderId: 'GPA.attr-rec', profileId: pid }));
    expect(await recoverPlayPurchase(OTHER_USER, SERVER_ID, SKU, token)).toEqual({ ok: false, code: 'OTHER_ACCOUNT' });
    expect(await readOrder(id)).toMatchObject({ s: 'paid', t: token });
    expect((await readDiamond()) - baselineDiamond).toBe(BigInt(DIAMOND));
    // 주인이 복구하면 already.
    expect(await recoverPlayPurchase(TEST_USER_ID, SERVER_ID, SKU, token)).toEqual({ ok: true, already: true, paymentId: pid });
  });

  it('주문 재사용 폐지: 새 주문을 만들면 같은 상품의 토큰 없는 옛 pending은 만료, 새 주문번호·계정 표식을 돌려준다', async () => {
    // 기간 제한 없는 다이아 상품(d1은 주기 상품이라 테스트 계정이 이미 샀으면 막힌다).
    const old = await insertOrder(newPid('old'), { product: 'starter', sku: 'dia_starter' });
    made.push(old);
    const o = await createPlayOrder(TEST_USER_ID, SERVER_ID, 'starter');
    const r = (await testDb.execute(sql`select id::text id from iap_orders where portone_order_id = ${o.paymentId}`)) as unknown as { id: string }[];
    made.push(BigInt(r[0]!.id));
    expect(o.paymentId).toMatch(/^gp-[0-9a-f-]{36}$/);
    expect(o.accountId).toBe(playAccountId(TEST_USER_ID));
    expect(o.sku).toBe('dia_starter');
    expect((await readOrder(old)).s).toBe('expired');
  });
});
