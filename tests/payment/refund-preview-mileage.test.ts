import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { mileageShortfallDiamond } from '@/lib/game/balance';
import { creditMileageForOrder } from '@/lib/game/points/wallet';
import { formatClawbackShortfall, previewClawback } from '@/lib/payment/refund';

import { endTestDb, sql, testDb } from '../db';

/**
 * 어드민 환불 사전 점검 — 이 주문의 마일리지를 이미 썼으면 다이아가 넉넉해도 '회수 가능'이 아니다(강제 환불로만 진행,
 * 2026-10-06 운영 결정). 쓴 몫은 다이아로 환산해 회수 필요량에 더해 보여 준다.
 */
describe('환불 사전 점검 문구(순수)', () => {
  it('마일리지 사용분이 섞이면 내역을 나눠 적고, 강제 환불로만 진행한다고 알린다', () => {
    const msg = formatClawbackShortfall({ diamondNeed: 5150, diamondHave: 5000, boxesNeed: 0, boxesHave: 0, sufficient: false, mileageShort: 59, mileageDiamond: 150 });
    expect(msg).toContain('회수할 재화가 부족합니다');
    expect(msg).toContain('다이아 회수 5,150(상품 지급 5,000 + 마일리지 환산 150) / 보유 5,000');
    expect(msg).toContain('마일리지 59점을 이미 사용(환불하면 다이아 150 회수)');
    expect(msg).toContain('강제 환불로만 진행할 수 있습니다');
  });
  it('다이아가 넉넉해도 마일리지를 썼으면 차단 문구가 나온다', () => {
    const msg = formatClawbackShortfall({ diamondNeed: 5150, diamondHave: 9000, boxesNeed: 0, boxesHave: 0, sufficient: false, mileageShort: 59, mileageDiamond: 150 });
    expect(msg).toContain('마일리지를 이미 사용한 주문입니다');
    expect(msg).toContain('마일리지 59점을 이미 사용(환불하면 다이아 150 회수)');
    expect(msg).toContain('강제 환불로만 진행할 수 있습니다');
    expect(msg).not.toContain('회수할 재화가 부족합니다');
  });
  it('마일리지 사용분이 없으면 종전 문구 그대로', () => {
    const msg = formatClawbackShortfall({ diamondNeed: 5000, diamondHave: 10, boxesNeed: 0, boxesHave: 0, sufficient: false });
    expect(msg).toContain('다이아 지급 5,000 / 보유 10');
    expect(formatClawbackShortfall({ diamondNeed: 0, diamondHave: 0, boxesNeed: 0, boxesHave: 0, sufficient: true })).toContain('부족분 없음');
  });
});

const U = process.env.TEST_USER_ID ?? '';
const TAG = `t${process.pid}_${Date.now()}`;
// 실재하지 않는 서버 번호의 지갑으로 검증한다(결제 테스트가 1서버 지갑을 병렬로 쓴다 — wallet.test와 같은 이유).
const MILE_SRV = 9000 + (process.pid % 900);

describe.skipIf(!U)('환불 사전 점검 — 마일리지 사용분(DB 통합)', () => {
  afterEach(async () => {
    await testDb.execute(sql`delete from point_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`delete from mileage_wallets where user_id=${U}::uuid and server_id=${MILE_SRV}`);
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('이미 쓴 마일리지는 10점당 💎25(올림)로 회수 필요량에 더해진다', async () => {
    const orderId = `${TAG}_p1`;
    expect(await creditMileageForOrder(testDb, { userId: U, serverId: MILE_SRV, orderId, amountKrw: 9900, note: '테스트 ₩9,900' })).toBe(99);
    // 지급이 없었던 주문(grantSkipped)으로 본다 — 상품 회수분은 0, 마일리지 몫만 남게.
    const untouched = await previewClawback(U, 1, 'first_special', { orderId, grantSkipped: true });
    expect(untouched.diamondNeed).toBe(0);
    expect(untouched.mileageShort).toBeUndefined();
    expect(untouched.sufficient).toBe(true);

    // 59점을 쓴 상황(지갑에 40점만 남김) → 부족 59점 = 💎150.
    await testDb.execute(sql`update mileage_wallets set balance = 40 where user_id=${U}::uuid and server_id=${MILE_SRV}`);
    const p = await previewClawback(U, 1, 'first_special', { orderId, grantSkipped: true });
    expect(p.mileageShort).toBe(59);
    expect(p.mileageDiamond).toBe(mileageShortfallDiamond(59));
    expect(p.mileageDiamond).toBe(150);
    expect(p.diamondNeed).toBe(150);
    expect(p.boxesNeed).toBe(0);
    // 다이아가 얼마가 있든, 쓴 마일리지가 있으면 '회수 가능'이 아니다 — 강제 환불로만.
    expect(p.sufficient).toBe(false);

    // 주문 번호를 주지 않으면(종전 호출) 마일리지는 보지 않는다.
    const legacy = await previewClawback(U, 1, 'first_special');
    expect(legacy.mileageShort).toBeUndefined();
    // 지급이 있었던 주문이면 상품 지급분 위에 더해진다.
    const full = await previewClawback(U, 1, 'first_special', { orderId });
    expect(full.diamondNeed).toBe(legacy.diamondNeed + 150);
  });
});
