import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

// 구글 API만 mock — 같은 기기의 다른 게임 계정이 산 구매를 상점 복구가 가져가지 않는지(스테이징 테스트 계정, 끝나면 지움).
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

import { getPlayProductPurchase } from '@/lib/payment/play-api';
import { recoverPlayPurchase } from '@/lib/payment/play-recover';

import { endTestDb, sql, testDb } from '../db';

const mockGet = vi.mocked(getPlayProductPurchase);
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SKU = 'dia_small';
let seq = 0;

describe.skipIf(skip)('상점 복구 — 다른 게임 계정의 구매 보호(DB 통합)', () => {
  const made: string[] = [];
  const alertKeys: string[] = [];

  afterEach(async () => {
    for (const pid of made) await testDb.execute(sql`delete from iap_orders where portone_order_id = ${pid}`);
    for (const k of alertKeys) await testDb.execute(sql`delete from payment_alerts where payment_id = ${k}`);
    made.length = 0;
    alertKeys.length = 0;
    mockGet.mockReset();
  });

  // 테스트 계정(= 결제한 다른 유저 A)의 토큰 없는 미완 주문. lastTryAgoMs = 구매 시각 기준 결제 시도가 얼마나 앞섰나.
  async function ownerOrder(purchaseAt: number, lastTryAgoMs: number) {
    const pid = `gp-recguard_${++seq}_${process.pid}`;
    made.push(pid);
    await testDb.execute(sql`
      insert into iap_orders (server_id, user_id, portone_order_id, product_code, amount_krw, diamond_granted, status, provider, play_sku, play_checkout_at)
      values (1, ${TEST_USER_ID}::uuid, ${pid}, 'small', 6000::bigint, 0::bigint, 'pending', 'play', ${SKU}, ${new Date(purchaseAt - lastTryAgoMs).toISOString()}::timestamptz)`);
    return pid;
  }

  it('복구한 유저의 결제 시도가 없고 다른 유저의 미완 주문이 구매 시각 근처에 있으면 지급하지 않고 경보', async () => {
    const pt = Date.now() - 10 * 60_000;
    const ownerPid = await ownerOrder(pt, 60_000);
    const gid = `GPA.recguard-${seq}-${process.pid}`;
    alertKeys.push(`recover:${gid}`);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: gid, purchaseTimeMillis: String(pt) });
    const other = randomUUID();
    const r = await recoverPlayPurchase(other, 1, SKU, `tok-recguard-${seq}`);
    expect(r).toEqual({ ok: false, code: 'NO_ORDER' });
    const a = (await testDb.execute(sql`select detail from payment_alerts where payment_id = ${'recover:' + gid}`)) as unknown as { detail: string }[];
    expect(a).toHaveLength(1);
    expect(a[0]!.detail).toContain(ownerPid);
    // A의 주문은 그대로(토큰 미결합·미완) — RTDN이 주인 주문으로 지급할 수 있게.
    const o = (await testDb.execute(sql`select status::text s, play_purchase_token t from iap_orders where portone_order_id = ${ownerPid}`)) as unknown as { s: string; t: string | null }[];
    expect(o[0]).toEqual({ s: 'pending', t: null });
  });

  it('다른 유저의 미완 주문이 구매 시각 창 밖이면 막지 않는다(경보 없음)', async () => {
    const pt = Date.now() - 10 * 60_000;
    await ownerOrder(pt, 8 * 3_600_000);
    const gid = `GPA.recguard-${seq}-${process.pid}`;
    alertKeys.push(`recover:${gid}`);
    mockGet.mockResolvedValue({ purchaseState: 0, consumptionState: 0, orderId: gid, purchaseTimeMillis: String(pt) });
    // 복구 유저는 캐릭터가 없는 임의 계정이라 ③ 새 주문 단계에서 실패한다 — 여기서는 보호 규칙이 막지 않았는지만 본다.
    await recoverPlayPurchase(randomUUID(), 1, SKU, `tok-recguard-${seq}`).catch(() => undefined);
    const a = (await testDb.execute(sql`select 1 from payment_alerts where payment_id = ${'recover:' + gid}`)) as unknown as unknown[];
    expect(a).toHaveLength(0);
  });
});

process.on('beforeExit', () => void endTestDb());
