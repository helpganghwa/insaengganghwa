import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// 정산 크론(payment-recon) 전 단계를 실제 스테이징 DB로 한 번 돌린다 — 새 SQL(A0 결제 시도 시각 만료, B2 장기 스윕,
// C 지급 보류 재환불 정렬·제공자 조건)이 배포 뒤 10분마다 실패하지 않는지 확인(2026-09-24 배포 전 점검).
// 외부 결제사(포트원 조회·취소)만 주문별 가짜 응답으로 바꾼다. 테스트 계정 주문만 만들고 끝나면 지운다.
const PG: Record<string, 'PAID' | 'CANCELLED' | 'NOT_FOUND'> = {};
vi.mock('@/lib/payment/portone', async (orig) => {
  const actual = await orig<typeof import('@/lib/payment/portone')>();
  return {
    ...actual,
    getPortonePayment: vi.fn(async (pid: string) => {
      const s = PG[pid];
      if (!s || s === 'NOT_FOUND') throw new actual.PortonePaymentNotFoundError(pid);
      return { status: s, amountTotal: 1000, currency: 'KRW', failure: null } as unknown as Awaited<ReturnType<typeof actual.getPortonePayment>>;
    }),
    // 취소하면 그 뒤 조회는 CANCELLED — 실제 PG처럼.
    cancelPortonePayment: vi.fn(async (pid: string) => {
      PG[pid] = 'CANCELLED';
    }),
  };
});

import { cancelPortonePayment } from '@/lib/payment/portone';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const tag = `gp-recontest_${process.pid}`;
const pid = (k: string) => `${tag}_${k}`;

describe.skipIf(skip)('정산 크론 전 단계 — 스테이징 DB 통합', () => {
  let monthly: { kst_month: string; t: string }[] = [];
  let diamond = '0';

  beforeAll(async () => {
    monthly = (await testDb.execute(sql`select kst_month, total_krw::text t from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`)) as unknown as typeof monthly;
    diamond = ((await testDb.execute(sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = 1`)) as unknown as { d: string }[])[0]!.d;
    const ins = (k: string, status: string, provider: string, extra: { created: string; paid?: string; checkout?: string; gs?: boolean; playSku?: string }) =>
      testDb.execute(sql`
        insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, grant_skipped, created_at, paid_at, play_checkout_at)
        values (1, ${TEST_USER_ID}::uuid, ${pid(k)}, 'starter', 1500::bigint, 0::bigint, ${status}::iap_status, ${provider}, ${extra.playSku ?? null}, ${extra.gs ?? false},
          now() - ${extra.created}::interval, ${extra.paid ? sql`now() - ${extra.paid}::interval` : null}, ${extra.checkout ? sql`now() - ${extra.checkout}::interval` : null})`);
    // A0: Play 이탈 주문 — 마지막 결제 시도 20시간 전 → 만료.
    await ins('a0', 'pending', 'play', { created: '20 hours', checkout: '20 hours', playSku: 'dia_starter' });
    // A: 포트원 이탈 주문 — PG에 결제 시도 없음(404) → 만료.
    await ins('a', 'pending', 'portone', { created: '20 hours' });
    // B: 최근 결제 — PG도 PAID → 손대지 않음.
    await ins('b', 'paid', 'portone', { created: '1 day', paid: '1 day' });
    // B2: 10일 전 결제 — PG도 PAID → 스캔만.
    await ins('b2', 'paid', 'portone', { created: '10 days', paid: '10 days' });
    // C: 지급 보류 결제(1시간 전) — 인라인 자동 환불 전에 함수가 죽어 PG는 아직 결제 완료 → C단계가 취소·환불로 마감.
    await ins('c', 'paid', 'portone', { created: '1 hour', paid: '1 hour', gs: true });
    Object.assign(PG, { [pid('a')]: 'NOT_FOUND', [pid('b')]: 'PAID', [pid('b2')]: 'PAID', [pid('c')]: 'PAID' });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await testDb.execute(sql`delete from payment_alerts where payment_id like ${'%' + tag + '%'} or order_id in (select id from iap_orders where portone_order_id like ${tag + '%'})`);
    await testDb.execute(sql`delete from iap_refunds where order_id in (select id from iap_orders where portone_order_id like ${tag + '%'})`);
    await testDb.execute(sql`delete from point_ledger where kind = 'mileage' and ref in (select 'order:' || id::text from iap_orders where portone_order_id like ${tag + '%'} union select 'order:' || id::text || ':refund' from iap_orders where portone_order_id like ${tag + '%'})`);
    await testDb.execute(sql`delete from iap_orders where portone_order_id like ${tag + '%'}`);
    await testDb.execute(sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and title = '결제 환불 안내' and created_at > now() - interval '10 minutes'`);
    await testDb.execute(sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid`);
    for (const m of monthly) await testDb.execute(sql`insert into monthly_purchase_limits (user_id, kst_month, total_krw) values (${TEST_USER_ID}::uuid, ${m.kst_month}, ${m.t}::bigint)`);
    await resyncTestMileage(TEST_USER_ID);
    await testDb.execute(sql`update characters set diamond = ${diamond}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = 1`);
    await endTestDb();
  });

  it('A0·A·B·B2·C가 SQL 오류 없이 돌고 각자 맞게 처리한다(04시대 실행)', async () => {
    process.env.CRON_SECRET = 'recon-test-secret';
    // B2(장기 스윕)는 KST 04시대에만 돈다 — JS 시계만 오늘 04:05 KST로 돌린다(DB now()는 실제 시각 그대로).
    const now = new Date();
    const at0405 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 19, 5) - (now.getUTCHours() < 19 ? 86_400_000 : 0));
    vi.useFakeTimers({ toFake: ['Date'], now: at0405 });
    const { GET } = await import('@/app/api/cron/payment-recon/route');
    const res = await GET(new Request('http://x/api/cron/payment-recon', { headers: { authorization: 'Bearer recon-test-secret' } }));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const out = (await res.json()) as Record<string, any>;

    const st = async (k: string) =>
      ((await testDb.execute(sql`select status::text s from iap_orders where portone_order_id = ${pid(k)}`)) as unknown as { s: string }[])[0]!.s;
    expect(await st('a0')).toBe('expired');
    expect(await st('a')).toBe('expired');
    expect(await st('b')).toBe('paid');
    expect(await st('b2')).toBe('paid');
    expect(await st('c')).toBe('refunded');
    expect(out.refundLongSweep.scanned).toBeGreaterThanOrEqual(1);
    expect(out.grantSkippedRefund).toMatchObject({ refunded: 1 });
    // 취소는 지급 보류 건 하나에만(B·B2의 정상 결제는 건드리지 않음).
    expect(vi.mocked(cancelPortonePayment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancelPortonePayment).mock.calls[0]![0]).toBe(pid('c'));
  });
});
