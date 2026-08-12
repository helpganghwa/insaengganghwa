import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// getPortonePayment(외부 PortOne REST)만 mock — 잠금 순서는 실제 DB에서 관측한다.
vi.mock('@/lib/payment/portone', () => ({ getPortonePayment: vi.fn() }));

import { getPortonePayment } from '@/lib/payment/portone';
import { refundPurchase } from '@/lib/payment/refund';
import { pgErrorCode } from '@/lib/db/errors';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getPortonePayment);

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

// 강화 패스 0구간(레벨 1~100, 마일스톤 10단위) 중 레벨 10 하나만 수령한 상태로 둔다.
// 프리미엄 보상 = BP_BASE_PREMIUM.enhance(50) × 구간배수(0+1) × step(10) = 500💎.
const SEGMENT_INDEX = 0;
const CLAIMED_TIER = 10;
const tiersJson = JSON.stringify([CLAIMED_TIER]); // premium_claimed_tiers는 jsonb 컬럼.
const RECLAIM_DIAMOND = 500n;
const PRODUCT = `bp_enhance_${SEGMENT_INDEX}`;
// 결제액 0 — 환불은 monthly_purchase_limits를 GREATEST(0, total − amount)로 되돌린다.
// 0이면 그 UPDATE가 값을 바꾸지 않아, 테스트 유저의 실제 월 누적을 오염시키지 않는다.
const AMOUNT_KRW = 0;

const PAYMENT_ID = `test_lockorder_${process.pid}`;

const one = <T>(rows: unknown) => (rows as T[])[0]!;

async function readDiamond(): Promise<bigint> {
  const r = await testDb.execute(
    sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`,
  );
  return BigInt(one<{ d: string }>(r)?.d ?? '0');
}

async function ledgerMaxId(): Promise<bigint> {
  const r = await testDb.execute(
    sql`select coalesce(max(id), 0)::text m from diamond_ledger where user_id = ${TEST_USER_ID}::uuid`,
  );
  return BigInt(one<{ m: string }>(r).m);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 환불 트랜잭션이 battlepass_segments 잠금에서 실제로 **대기 중**이 될 때까지 기다린다.
 * 고정 sleep으로 찍으면 아직 그 지점에 도달하지 못한 경우와 구분되지 않아, 잠금 대기 자체를 본다.
 */
async function waitUntilBlockedOnSegments(timeoutMs = 10_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await testDb.execute(sql`
      select count(*)::int n from pg_stat_activity
      where pid <> pg_backend_pid()
        and wait_event_type = 'Lock' and query ilike '%battlepass_segments%'`);
    if (one<{ n: number }>(r).n > 0) return true;
    await wait(50);
  }
  return false;
}

async function cleanup(baselineDiamond: bigint, ledgerFrom: bigint) {
  // 접두어로 쓸어 담는다 — 이 파일이 만드는 주문은 전부 test_lockorder_*라, 죽은 실행이 남긴
  // 것까지 같이 정리된다(주문 id를 못 잡은 경우 대비).
  await testDb.execute(sql`
    delete from iap_refunds where order_id in
      (select id from iap_orders where portone_order_id like 'test_lockorder\\_%')`);
  await testDb.execute(sql`delete from iap_orders where portone_order_id like 'test_lockorder\\_%'`);
  await testDb.execute(sql`
    delete from battlepass_segments
    where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}`);
  await testDb.execute(sql`
    delete from diamond_ledger
    where user_id = ${TEST_USER_ID}::uuid and id > ${ledgerFrom.toString()}::bigint
      and reason = 'refund_clawback'`);
  await testDb.execute(sql`
    delete from mailbox
    where user_id = ${TEST_USER_ID}::uuid and type = 'notice' and title = '결제 환불 안내'`);
  await testDb.execute(sql`delete from payment_alerts where payment_id = ${PAYMENT_ID}`);
  await testDb.execute(sql`
    update characters set diamond = ${baselineDiamond.toString()}::bigint
    where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
}

/**
 * 환불 ↔ 수령 교착(AB-BA) 회귀 방지.
 *
 * 수령 경로(claimSegment·claimPremiumTier·claimPremium)는 **battlepass_segments → characters**
 * 순으로 잠근다. 환불이 그 반대(characters → battlepass_segments)로 잠그면 같은 유저에게 두
 * 경로가 겹치는 순간 한쪽이 40P01로 죽는다 — 환불이 지는 쪽이면 PG는 취소됐는데 회수는 안 된
 * 상태가 된다. 그래서 환불도 구간을 먼저 잠근다(lib/payment/refund.ts clawbackNeed lock=true).
 *
 * 검증 방법: 구간 행을 밖에서 잠가 환불을 그 지점에 세운 뒤, **characters가 아직 자유로운지**를
 * FOR UPDATE NOWAIT로 즉시 판정한다. 순서가 뒤집혀 있으면 이 시점에 characters는 이미 잠겨 있다.
 */
describe.skipIf(skip)('환불 잠금 순서 — 배틀패스 구간을 characters보다 먼저 잠근다', () => {
  let baselineDiamond = 0n;
  let ledgerFrom = 0n;

  beforeAll(async () => {
    baselineDiamond = await readDiamond();
    ledgerFrom = await ledgerMaxId();
    // 회수분(500💎)을 미리 얹어 둔다 — 부족하면 REFUND_CLAWBACK_SHORT 경로로 갈라져
    // 이 테스트가 보려는 잠금 순서가 아니라 부족분 처리를 재는 테스트가 된다.
    await testDb.execute(sql`
      update characters set diamond = diamond + ${RECLAIM_DIAMOND.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
    await testDb.execute(sql`
      insert into battlepass_segments (user_id, server_id, pass_type, segment_index, premium_claimed_tiers)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, 'enhance', ${SEGMENT_INDEX}, ${tiersJson}::jsonb)
      on conflict (user_id, server_id, pass_type, segment_index)
      do update set premium_claimed_tiers = ${tiersJson}::jsonb`);
    const r = await testDb.execute(sql`
      insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, paid_at)
      values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${PAYMENT_ID}, ${PRODUCT}, ${AMOUNT_KRW}::bigint, 0::bigint, 'paid', now())
      returning id::text id`);
    expect(one<{ id: string }>(r).id).toBeTruthy();
    mockGet.mockResolvedValue({
      status: 'CANCELLED',
      amountTotal: AMOUNT_KRW,
      currency: 'KRW',
      paymentId: PAYMENT_ID,
    } as Awaited<ReturnType<typeof getPortonePayment>>);
  });

  afterAll(async () => {
    await cleanup(baselineDiamond, ledgerFrom);
    await endTestDb();
  });

  it('구간 행이 잠긴 동안 환불은 characters를 아직 잠그지 않는다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    // 구간 행을 밖에서 붙잡아 환불을 그 지점에 세운다.
    const parked = testDb.transaction(async (ptx) => {
      await ptx.execute(sql`
        select 1 from battlepass_segments
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
          and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}
        for update`);
      await gate;
    });

    // .catch로 미리 감싸 reject를 삼킨다 — 아래 finally에서 **반드시 정착까지 기다리기** 위함이다.
    // 단정이 던지면 이 프라미스를 기다리지 않은 채 afterAll 정리가 먼저 돌아, 뒤늦게 커밋된
    // 주문·우편·원장이 공유 테스트 계정에 남는다(실측으로 확인).
    const refunding = refundPurchase(PAYMENT_ID).catch((e: unknown) => e);
    let settled: unknown;
    try {
      expect(await waitUntilBlockedOnSegments()).toBe(true);

      // 핵심 단정 — 이 시점에 characters가 자유로우면 환불이 구간을 먼저 잠갔다는 뜻이다.
      // 순서가 뒤집혀 있으면 이미 잠겨 있어 55P03(lock_not_available)이 난다.
      let probeCode: string | undefined;
      try {
        await testDb.execute(sql`
          select 1 from characters
          where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
          for update nowait`);
      } catch (e) {
        probeCode = pgErrorCode(e);
      }
      expect(probeCode).toBeUndefined();
    } finally {
      release();
      await parked.catch(() => {});
      settled = await refunding;
    }

    // 파킹을 풀면 환불이 그대로 완주한다 — 순서를 바꾼 것이 결과를 바꾸지 않았음을 함께 확인.
    expect(settled).toEqual({ ok: true, already: false });
    const seg = await testDb.execute(sql`
      select count(*)::int n from battlepass_segments
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}`);
    expect(one<{ n: number }>(seg).n).toBe(0); // 구간 권리 회수(재잠금)
    expect(await readDiamond()).toBe(baselineDiamond); // 500💎 지급분 전액 회수
  }, 30_000);
});
