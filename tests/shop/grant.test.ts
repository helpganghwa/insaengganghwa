import { afterAll, describe, expect, it } from 'vitest';

import { applyProductGrant, reclaimProductGrant } from '@/lib/game/shop/grant';
import { FIRST_SPECIAL, PREMIUM } from '@/lib/game/shop/catalog';
import { getWalletDiamond } from '@/lib/game/wallet';

import { endTestDb, sql, testDb } from '../db';

/**
 * shop/grant — 실결제(payment)와 dev 즉시구매가 공유하는 상품 지급/회수 단일 진실 원천.
 * applyProductGrant/reclaimProductGrant가 tx를 받으므로 wallet과 동일하게 **롤백 tx**로 검증
 * (공유 DB 무오염). 특히 인생특가(first_special) 1회성 멱등과 환불 후 마크 유지(어뷰징 방지)를 회귀.
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;

type Tx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];
class Rollback extends Error {}
async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function boxCount(tx: Tx, slot: string): Promise<bigint> {
  const r = (await tx.execute(sql`
    select coalesce(count, 0)::text c from user_supply_boxes
    where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID} and slot = ${slot}
  `)) as unknown as { c: string }[];
  return BigInt(r[0]?.c ?? '0');
}

async function setBoxCount(tx: Tx, slot: string, n: number): Promise<void> {
  await tx.execute(sql`
    insert into user_supply_boxes (user_id, server_id, slot, count)
    values (${TEST_USER_ID}::uuid, ${SID}, ${slot}::slot, ${n})
    on conflict (user_id, server_id, slot) do update set count = excluded.count
  `);
}

async function boxTotal(tx: Tx): Promise<bigint> {
  return (
    (await boxCount(tx, 'weapon')) +
    (await boxCount(tx, 'armor')) +
    (await boxCount(tx, 'accessory'))
  );
}

afterAll(async () => {
  await endTestDb();
});

describe.skipIf(skip)('shop/grant — 상품 지급/회수', () => {
  it('applyProductGrant(starter): 지갑 +300, 박스 0, 반환값 일치', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SID);
      const g = await applyProductGrant(tx, TEST_USER_ID, SID, 'starter');
      expect(g).toMatchObject({ diamond: 300, boxes: 0 });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(before + 300n);
    });
  });

  it('applyProductGrant(first_special): 지갑 +5000 + 박스 30 슬롯 균등분배(10/10/10)', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SID);
      const [bw, ba, bc] = [
        await boxCount(tx, 'weapon'),
        await boxCount(tx, 'armor'),
        await boxCount(tx, 'accessory'),
      ];
      const g = await applyProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      expect(g).toMatchObject({ diamond: 5000, boxes: 30 });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(before + 5000n);
      expect(await boxCount(tx, 'weapon')).toBe(bw + 10n);
      expect(await boxCount(tx, 'armor')).toBe(ba + 10n);
      expect(await boxCount(tx, 'accessory')).toBe(bc + 10n);
    });
  });

  it('first_special 멱등: 2번째 apply는 skipped=true·추가 지급 없음', async () => {
    await inRollback(async (tx) => {
      const g1 = await applyProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      expect(g1.skipped).toBeFalsy();
      const mid = await getWalletDiamond(tx, TEST_USER_ID, SID);
      const g2 = await applyProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      expect(g2).toMatchObject({ diamond: 0, boxes: 0, skipped: true });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(mid); // 불변
    });
  });

  it('reclaim(first_special): 재화 회수 + once 마크 유지 → 재apply 여전히 skipped(어뷰징 방지)', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SID);
      await applyProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      await reclaimProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(before); // 5000 회수
      // 특가 마크는 남는다 → 환불 후 재구매(재지급) 불가.
      const again = await applyProductGrant(tx, TEST_USER_ID, SID, FIRST_SPECIAL.id);
      expect(again.skipped).toBe(true);
    });
  });

  it('reclaim 0 클램프: 잔액보다 큰 회수도 음수로 내려가지 않음', async () => {
    await inRollback(async (tx) => {
      // 잔액을 0으로 맞춘 뒤 starter(300) 회수 → GREATEST(0, ...)로 0 유지.
      const cur = await getWalletDiamond(tx, TEST_USER_ID, SID);
      if (cur > 0n) {
        await tx.execute(
          sql`update characters set diamond = 0 where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID}`,
        );
      }
      await reclaimProductGrant(tx, TEST_USER_ID, SID, 'starter');
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(0n);
    });
  });

  it('reclaim 상자: 한 슬롯이 0이어도 슬롯 합계가 정확히 지급량만큼 감소', async () => {
    await inRollback(async (tx) => {
      // m3(258상자) 구매 후 유저가 weapon 상자를 전부 열어버린 분포 —
      // 슬롯별 역분배(86/86/86)로 회수하면 weapon에서 86개가 조용히 누락된다.
      await setBoxCount(tx, 'weapon', 0);
      await setBoxCount(tx, 'armor', 200);
      await setBoxCount(tx, 'accessory', 200);
      const g = await applyProductGrant(tx, TEST_USER_ID, SID, 'm3');
      expect(g).toMatchObject({ boxes: 258 });
      await setBoxCount(tx, 'weapon', 0);
      const before = await boxTotal(tx);

      await reclaimProductGrant(tx, TEST_USER_ID, SID, 'm3');

      expect(await boxTotal(tx)).toBe(before - 258n);
      expect(await boxCount(tx, 'weapon')).toBe(0n); // 음수 없음
    });
  });

  it('reclaim 상자: 보유 합계 부족이면 있는 만큼만 회수·음수 없음', async () => {
    await inRollback(async (tx) => {
      await setBoxCount(tx, 'weapon', 0);
      await setBoxCount(tx, 'armor', 10);
      await setBoxCount(tx, 'accessory', 5);

      await reclaimProductGrant(tx, TEST_USER_ID, SID, 'm3'); // 258 회수 시도 / 보유 15

      expect(await boxCount(tx, 'weapon')).toBe(0n);
      expect(await boxCount(tx, 'armor')).toBe(0n);
      expect(await boxCount(tx, 'accessory')).toBe(0n);
      expect(await boxTotal(tx)).toBe(0n);
    });
  });

  it('applyProductGrant(premium): 직접 지급 대신 우편 적재, reclaim은 미수령 우편 회수', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SID);
      await applyProductGrant(tx, TEST_USER_ID, SID, PREMIUM.id);
      // 프리미엄은 즉시 지급이 아니라 우편(수령 시 반영) — 지갑 불변.
      expect(await getWalletDiamond(tx, TEST_USER_ID, SID)).toBe(before);
      const mail = (await tx.execute(sql`
        select count(*)::int n from mailbox
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID}
          and sender_label = '성장 프리미엄' and claimed_at is null
      `)) as unknown as { n: number }[];
      expect(mail[0]!.n).toBeGreaterThanOrEqual(1);

      await reclaimProductGrant(tx, TEST_USER_ID, SID, PREMIUM.id);
      const after = (await tx.execute(sql`
        select count(*)::int n from mailbox
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID}
          and sender_label = '성장 프리미엄' and claimed_at is null
      `)) as unknown as { n: number }[];
      expect(after[0]!.n).toBe(0); // 미수령 프리미엄 우편 회수
    });
  });
});
