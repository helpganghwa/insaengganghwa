import { afterAll, describe, expect, it } from 'vitest';

import {
  TAX_MELEE_PRIZE_RATE,
  TAX_POINTS_PER_DIAMOND,
  taxPointsForMeleePrize,
  taxPointsForSpend,
} from '@/lib/game/guild/balance';
import { accrueMeleePrizeTax } from '@/lib/game/guild/tax';
import { walletTrySpend } from '@/lib/game/wallet';

import { testDb, sql, endTestDb } from '../db';

/**
 * 세금 원천 ②③(2026-09-04) — 다이아 지출 1%·대난투 상금 10%가 거주 구역에 세율 배율로 쌓이는지 실증.
 * DB 검사는 TEST_USER_ID의 캐릭터(거주 구역 보유)로 트랜잭션 안에서 실행하고 ROLLBACK — 잔액·구역 무오염.
 */
const USER = process.env.TEST_USER_ID!;
const ROLLBACK = new Error('ROLLBACK');

type ZoneTax = { id: number; bonus: number; total: bigint };
/** 구역 세금을 포인트 단위 총량(💎×100 + pt)으로 읽는다 — carry 경계를 넘어도 비교 가능. */
async function readZoneTax(tx: Parameters<Parameters<typeof testDb.transaction>[0]>[0], userId: string, serverId: number): Promise<ZoneTax> {
  const [r] = (await tx.execute(sql`
    select z.id, z.tax_bonus::float8 as bonus, (z.tax_diamond * ${TAX_POINTS_PER_DIAMOND} + z.tax_points)::text as total
    from characters c join zones z on z.id = c.residence_zone_id
    where c.user_id = ${userId}::uuid and c.server_id = ${serverId}
  `)) as unknown as { id: number; bonus: number; total: string }[];
  if (!r) throw new Error('테스트 유저에게 거주 구역이 없다');
  return { id: r.id, bonus: Number(r.bonus), total: BigInt(r.total) };
}

async function testServerId(): Promise<number> {
  const [r] = (await testDb.execute(sql`select server_id from characters where user_id = ${USER}::uuid order by server_id limit 1`)) as unknown as { server_id: number }[];
  if (!r) throw new Error('테스트 유저 캐릭터 없음');
  return Number(r.server_id);
}

describe('세금 원천 — 지출·대난투 상금', () => {
  afterAll(endTestDb);

  it('환산: 지출 1💎 = 1pt, 상금 10% × 100pt', () => {
    expect(taxPointsForSpend(250)).toBe(250);
    expect(taxPointsForSpend(0)).toBe(0);
    expect(taxPointsForSpend(-5)).toBe(0);
    expect(taxPointsForMeleePrize(1000)).toBe(Math.round(1000 * TAX_MELEE_PRIZE_RATE * TAX_POINTS_PER_DIAMOND));
    expect(taxPointsForMeleePrize(0)).toBe(0);
  });

  it('walletTrySpend 성공 시 거주 구역에 지출 1%(×세율)가 쌓이고, 잔액 부족이면 쌓이지 않는다', async () => {
    if (!USER) throw new Error('TEST_USER_ID 필요(.env.local)');
    const sid = await testServerId();
    await testDb
      .transaction(async (tx) => {
        const before = await readZoneTax(tx, USER, sid);
        const ok = await walletTrySpend(tx, USER, sid, 250, 'shop_box', 'test_tax');
        expect(ok).toBe(true);
        const after = await readZoneTax(tx, USER, sid);
        expect(after.total - before.total).toBe(BigInt(Math.round(250 * before.bonus)));

        // 잔액 부족 — 차감 실패면 세금도 없다.
        const [w] = (await tx.execute(sql`select diamond::text as d from characters where user_id = ${USER}::uuid and server_id = ${sid}`)) as unknown as { d: string }[];
        const tooMuch = BigInt(w!.d) + 1n;
        const fail = await walletTrySpend(tx, USER, sid, tooMuch, 'shop_box', 'test_tax');
        expect(fail).toBe(false);
        const after2 = await readZoneTax(tx, USER, sid);
        expect(after2.total).toBe(after.total);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });

  it('대난투 발표: 참가자 상금의 10%(×세율)가 거주 구역에 한 번에 쌓인다', async () => {
    if (!USER) throw new Error('TEST_USER_ID 필요(.env.local)');
    const sid = await testServerId();
    await testDb
      .transaction(async (tx) => {
        const before = await readZoneTax(tx, USER, sid);
        const [b] = (await tx.execute(sql`
          insert into melee_battles (server_id, battle_date, seed, status)
          values (${sid}, '2001-01-01', 'test_tax', 'revealed') returning id::text
        `)) as unknown as { id: string }[];
        const battleId = BigInt(b!.id);
        await tx.execute(sql`
          insert into melee_participants (battle_id, user_id, cp_snapshot, final_rank, reward_diamond, reward_boxes)
          values (${battleId}, ${USER}::uuid, 1, 1, 1000, '{"weapon":0,"armor":0,"accessory":0}'::jsonb)
        `);
        await accrueMeleePrizeTax(sid, battleId, tx);
        const after = await readZoneTax(tx, USER, sid);
        expect(after.total - before.total).toBe(BigInt(Math.round(taxPointsForMeleePrize(1000) * before.bonus)));
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
