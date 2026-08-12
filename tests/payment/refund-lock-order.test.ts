import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// getPortonePayment(외부 PortOne REST)만 mock — 잠금 순서는 실제 DB에서 관측한다.
vi.mock('@/lib/payment/portone', () => ({ getPortonePayment: vi.fn() }));

import { getPortonePayment } from '@/lib/payment/portone';
import { refundPurchase } from '@/lib/payment/refund';
import { pgErrorCode } from '@/lib/db/errors';
import { kstMonthString } from '@/lib/kst';

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
const PAYMENT_ID_MONTHLY = `test_lockorder_${process.pid}_m`;

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
 * 환불 트랜잭션이 파킹 백엔드가 쥔 잠금에서 실제로 **대기 중**이 될 때까지 기다린다.
 * 고정 sleep으로 찍으면 아직 그 지점에 도달하지 못한 경우와 구분되지 않아, 잠금 대기 자체를 본다.
 *
 * 판정을 pg_blocking_pids로 좁힌 이유: 공유 스테이징이라 "battlepass_segments를 건드리며 Lock을
 * 기다리는 백엔드"만 보면 **무관한 남의 대기**를 우리 환불로 오인할 수 있다. 오인이 환불이
 * characters에 닿기 전에 일어나면 회귀가 있어도 프로브가 먼저 통과해 조용히 미검출된다.
 * "우리 파킹 트랜잭션이 막고 있는 백엔드"로 물으면 그 창이 사라진다.
 */
async function waitUntilBlockedBy(blockerPid: number, timeoutMs = 10_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await testDb.execute(sql`
      select count(*)::int n from pg_stat_activity
      where pid <> pg_backend_pid() and ${blockerPid} = any(pg_blocking_pids(pid))`);
    if (one<{ n: number }>(r).n > 0) return true;
    await wait(50);
  }
  return false;
}

/**
 * ⚠ baseline이 **null이면 그 복원은 건너뛴다.** vitest는 beforeAll이 던지거나 타임아웃해도
 * afterAll을 실행한다(실측). 초기값을 0n으로 두면 준비 단계가 풀러 지연으로 넘어졌을 때
 * "잔액을 0으로 덮어쓰고 원장을 전삭제하는" 정리가 돌아, 공유 테스트 계정을 파괴한다.
 * 이 프로젝트에 실재하는 beforeAll 타임아웃 플레이크와 정확히 겹치는 조건이다.
 */
async function cleanup(baselineDiamond: bigint | null, ledgerFrom: bigint | null) {
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
  if (ledgerFrom !== null) {
    await testDb.execute(sql`
      delete from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${ledgerFrom.toString()}::bigint
        and reason = 'refund_clawback'`);
  }
  await testDb.execute(sql`
    delete from mailbox
    where user_id = ${TEST_USER_ID}::uuid and type = 'notice' and title = '결제 환불 안내'`);
  await testDb.execute(
    sql`delete from payment_alerts where payment_id in (${PAYMENT_ID}, ${PAYMENT_ID_MONTHLY})`,
  );
  // 월누적은 이 파일이 심은 행만 지운다 — 테스트 계정엔 원래 없다(실측). 결제액 0이라 값도 안 변한다.
  await testDb.execute(
    sql`delete from monthly_purchase_limits where user_id = ${TEST_USER_ID}::uuid and total_krw = 0`,
  );
  if (baselineDiamond !== null) {
    await testDb.execute(sql`
      update characters set diamond = ${baselineDiamond.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
  }
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
  let baselineDiamond: bigint | null = null;
  let ledgerFrom: bigint | null = null;

  beforeAll(async () => {
    const d = await readDiamond();
    // 잔액이 회수분보다 적으면 REFUND_CLAWBACK_SHORT로 갈라져, 이 테스트가 보려는 잠금 순서가
    // 아니라 부족분 처리를 재게 된다. 얹어서 맞추지 않고 **전제**로 둔다 — 얹으면 프로세스가
    // 강제 종료됐을 때 그 증분이 계정에 그대로 남는다.
    if (d < RECLAIM_DIAMOND) throw new Error(`테스트 계정 다이아 부족: ${d} < ${RECLAIM_DIAMOND}`);
    baselineDiamond = d;
    ledgerFrom = await ledgerMaxId();
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
    let onParked!: (pid: number) => void;
    const parkedPid = new Promise<number>((r) => {
      onParked = r;
    });

    // 구간 행을 밖에서 붙잡아 환불을 그 지점에 세운다. 자기 backend pid를 먼저 뽑아 두는 건
    // 아래 프로브가 "이 백엔드에 막힌 놈"만 세기 위함이다(waitUntilBlockedBy 주석 참조).
    const parked = testDb.transaction(async (ptx) => {
      const p = await ptx.execute(sql`select pg_backend_pid()::int pid`);
      await ptx.execute(sql`
        select 1 from battlepass_segments
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
          and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}
        for update`);
      onParked(one<{ pid: number }>(p).pid);
      await gate;
    });
    const blockerPid = await parkedPid;

    // .catch로 미리 감싸 reject를 삼킨다 — 아래 finally에서 **반드시 정착까지 기다리기** 위함이다.
    // 단정이 던지면 이 프라미스를 기다리지 않은 채 afterAll 정리가 먼저 돌아, 뒤늦게 커밋된
    // 주문·우편·원장이 공유 테스트 계정에 남는다(실측으로 확인).
    const refunding = refundPurchase(PAYMENT_ID).catch((e: unknown) => e);
    let settled: unknown;
    try {
      expect(await waitUntilBlockedBy(blockerPid)).toBe(true);

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
    expect(await readDiamond()).toBe(baselineDiamond! - RECLAIM_DIAMOND); // 500💎 지급분 전액 회수
  }, 30_000);

  /**
   * 지급(completePurchase)은 iap_orders 다음으로 monthly_purchase_limits를 잠그고 **그 뒤에**
   * 재화(battlepass_segments·characters)를 건드린다. 환불이 재화를 먼저 잠그면 두 트랜잭션의
   * 순서가 정확히 반대가 되는데, iap_orders는 **서로 다른 주문 행**이라 직렬화해 주지 못한다 —
   * 같은 유저가 결제하는 동안 다른 주문이 환불되면(웹훅·recon·어드민) 40P01이다.
   */
  it('월누적 행이 잠긴 동안 환불은 재화 테이블을 아직 잠그지 않는다', async () => {
    const kstMonth = kstMonthString();
    // 월누적 행이 없으면 환불의 UPDATE가 0행이라 잠금 자체가 안 생긴다 — 결제 이력이 있는
    // 유저에겐 항상 있는 행이므로(completePurchase가 upsert) 여기서도 만들어 둔다.
    await testDb.execute(sql`
      insert into monthly_purchase_limits (user_id, kst_month, total_krw)
      values (${TEST_USER_ID}::uuid, ${kstMonth}, 0::bigint)
      on conflict (user_id, kst_month) do nothing`);
    // 앞 테스트의 환불이 구간을 지웠으므로 다시 심는다(회수 대상이 있어야 재화를 잠근다).
    await testDb.execute(sql`
      insert into battlepass_segments (user_id, server_id, pass_type, segment_index, premium_claimed_tiers)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, 'enhance', ${SEGMENT_INDEX}, ${tiersJson}::jsonb)
      on conflict (user_id, server_id, pass_type, segment_index)
      do update set premium_claimed_tiers = ${tiersJson}::jsonb`);
    await testDb.execute(sql`
      insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, paid_at)
      values (${SERVER_ID}, ${TEST_USER_ID}::uuid, ${PAYMENT_ID_MONTHLY}, ${PRODUCT}, ${AMOUNT_KRW}::bigint, 0::bigint, 'paid', now())`);
    mockGet.mockResolvedValue({
      status: 'CANCELLED',
      amountTotal: AMOUNT_KRW,
      currency: 'KRW',
      paymentId: PAYMENT_ID_MONTHLY,
    } as Awaited<ReturnType<typeof getPortonePayment>>);

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let onParked!: (pid: number) => void;
    const parkedPid = new Promise<number>((r) => {
      onParked = r;
    });

    const parked = testDb.transaction(async (ptx) => {
      const p = await ptx.execute(sql`select pg_backend_pid()::int pid`);
      await ptx.execute(sql`
        select 1 from monthly_purchase_limits
        where user_id = ${TEST_USER_ID}::uuid and kst_month = ${kstMonth}
        for update`);
      onParked(one<{ pid: number }>(p).pid);
      await gate;
    });
    const blockerPid = await parkedPid;

    const refunding = refundPurchase(PAYMENT_ID_MONTHLY).catch((e: unknown) => e);
    let settled: unknown;
    try {
      expect(await waitUntilBlockedBy(blockerPid)).toBe(true);

      // 핵심 단정 — 월누적에서 막혀 있는 지금 구간 행이 자유로우면 순서가 지급과 같다는 뜻이다.
      // 뒤집혀 있으면 회수가 먼저 돌아 이미 잠겨 있고 55P03이 난다.
      let probeCode: string | undefined;
      try {
        await testDb.execute(sql`
          select 1 from battlepass_segments
          where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
            and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}
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

    expect(settled).toEqual({ ok: true, already: false });
    const seg = await testDb.execute(sql`
      select count(*)::int n from battlepass_segments
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = 'enhance' and segment_index = ${SEGMENT_INDEX}`);
    expect(one<{ n: number }>(seg).n).toBe(0);
  }, 30_000);
});
