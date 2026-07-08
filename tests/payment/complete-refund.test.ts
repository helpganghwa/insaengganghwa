import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// getPortonePayment(외부 PortOne REST)만 mock — 나머지(지급·회수·DB)는 실제 경로로 검증.
vi.mock('@/lib/payment/portone', () => ({ getPortonePayment: vi.fn() }));

import { getPortonePayment } from '@/lib/payment/portone';
import { completePurchase } from '@/lib/payment/purchase';
import { refundPurchase } from '@/lib/payment/refund';
import { kstMonthString } from '@/lib/kst';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getPortonePayment);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

// starter 다이아팩 — 다이아 300, ₩1,500, 비주기(shopPurchases 마크 없음 → 정리 단순).
const PRODUCT = 'starter';
const AMOUNT = 1500;
const DIAMOND = 300;

let seq = 0;
function newPid(tag: string): string {
  seq += 1;
  return `test_${tag}_${seq}_${process.pid}`;
}
function paid(pid: string, amount = AMOUNT) {
  return { status: 'PAID' as const, amountTotal: amount, currency: 'KRW', paymentId: pid };
}
function cancelled(pid: string) {
  return { status: 'CANCELLED' as const, amountTotal: AMOUNT, currency: 'KRW', paymentId: pid };
}

async function insertOrder(pid: string): Promise<bigint> {
  const r = (await testDb.execute(sql`
    insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status)
    values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${pid}, ${PRODUCT}, ${AMOUNT}::bigint, ${DIAMOND}::bigint, 'pending')
    returning id::text id`)) as unknown as { id: string }[];
  return BigInt(r[0]!.id);
}
async function readDiamond(): Promise<bigint> {
  const r = (await testDb.execute(
    sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`,
  )) as unknown as { d: string }[];
  return BigInt(r[0]?.d ?? '0');
}
async function readStatus(id: bigint): Promise<string> {
  const r = (await testDb.execute(
    sql`select status::text s from iap_orders where id = ${id.toString()}::bigint`,
  )) as unknown as { s: string }[];
  return r[0]!.s;
}

describe.skipIf(skip)('머니경로 — completePurchase/refundPurchase DB 통합', () => {
  let testStart: Date;
  let baselineDiamond = 0n;

  beforeAll(() => {
    testStart = new Date();
  });

  beforeEach(async () => {
    baselineDiamond = await readDiamond();
  });

  afterEach(async () => {
    // 주문·환불 기록 제거 + 다이아 원복 + 월 누적 원복(이 테스트가 만든 분만).
    // 테스트 주문에 딸린 자식 행(FK)부터 정리 후 주문 삭제 — 타임스탬프 의존 없이 주문관계로 확실히.
    // (iap_refunds·payment_alerts 모두 iap_orders를 FK 참조. payment_alerts는 사고 알림 시스템이 테스트 후 추가됨.)
    await testDb.execute(
      sql`delete from iap_refunds where order_id in (
        select id from iap_orders where user_id = ${TEST_USER_ID}::uuid and portone_order_id like 'test\\_%'
      )`,
    );
    await testDb.execute(
      sql`delete from payment_alerts where order_id in (
        select id from iap_orders where user_id = ${TEST_USER_ID}::uuid and portone_order_id like 'test\\_%'
      )`,
    );
    await testDb.execute(
      sql`delete from iap_orders where user_id = ${TEST_USER_ID}::uuid and portone_order_id like 'test\\_%'`,
    );
    await testDb.execute(
      sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and title = '결제 환불 안내' and created_at >= ${testStart.toISOString()}`,
    );
    // 다이아를 베이스라인으로 강제 원복(grant/clawback 잔여 제거).
    await testDb.execute(
      sql`update characters set diamond = ${baselineDiamond.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`,
    );
  });

  afterAll(async () => {
    // 월 누적 테이블에 테스트가 남긴 가산 제거 — 결제월 행을 0 클램프로 되돌릴 수 없어 행 삭제.
    await testDb.execute(
      sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid and kst_month = ${kstMonthString()}`,
    );
    await endTestDb();
  });

  it('정상 지급 + 멱등(2회 호출에도 1회만 지급)', async () => {
    const pid = newPid('idem');
    const id = await insertOrder(pid);
    mockGet.mockResolvedValue(paid(pid));
    const d0 = await readDiamond();

    const r1 = await completePurchase(pid);
    expect(r1).toEqual({ ok: true, already: false });
    expect(await readDiamond()).toBe(d0 + BigInt(DIAMOND));
    expect(await readStatus(id)).toBe('paid');

    const r2 = await completePurchase(pid);
    expect(r2).toEqual({ ok: true, already: true });
    expect(await readDiamond()).toBe(d0 + BigInt(DIAMOND)); // 재지급 없음
  });

  it('금액 불일치 → 지급 차단(AMOUNT_MISMATCH), 주문 pending 유지', async () => {
    const pid = newPid('mismatch');
    const id = await insertOrder(pid);
    mockGet.mockResolvedValue(paid(pid, AMOUNT - 1)); // 위변조 금액
    const d0 = await readDiamond();

    const r = await completePurchase(pid);
    expect(r).toEqual({ ok: false, code: 'AMOUNT_MISMATCH' });
    expect(await readDiamond()).toBe(d0); // 지급 없음
    expect(await readStatus(id)).toBe('pending');
  });

  it('환불 → 지급분 회수, 주문 refunded', async () => {
    const pid = newPid('refund');
    const id = await insertOrder(pid);
    const d0 = await readDiamond();

    mockGet.mockResolvedValue(paid(pid));
    expect((await completePurchase(pid)).ok).toBe(true);
    expect(await readDiamond()).toBe(d0 + BigInt(DIAMOND));

    mockGet.mockResolvedValue(cancelled(pid));
    const r = await refundPurchase(pid);
    expect(r.ok).toBe(true);
    expect(await readDiamond()).toBe(d0); // 회수 완료
    expect(await readStatus(id)).toBe('refunded');
  });
});
