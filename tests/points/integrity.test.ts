import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POINT_EXTRA_PRICES, meleePointsForRank } from '@/lib/game/balance';
import { recreditMissingMeleePoints } from '@/lib/game/melee/reveal';
import { buyExtra } from '@/lib/game/points/extra';
import { extrasToday } from '@/lib/game/points/spend';
import { creditMeleePoints, creditMileageForOrder } from '@/lib/game/points/wallet';
import { kstDateString } from '@/lib/kst';

import { endTestDb, resyncTestMileage, sql, testDb } from '../db';

/**
 * 포인트 장부의 빈틈(2026-10-06 3차 점검) — 원장과 잔액이 따로 놀 수 있던 자리를 실제 DB에서 확인한다
 * (스테이징 테스트 계정, 끝나면 되돌림).
 *  ① 캐릭터가 없는 서버에는 대난투 포인트가 적립되지 않고 원장 행도 남지 않는다.
 *  ② 발표가 적립 도중 끊겨 포인트가 빠진 참가자는 다음 틱이 한 번만 채운다.
 *  ③ 같은 요청 키를 화폐만 바꿔 다시 보내도 추가 횟수는 한 번만 사진다.
 */
const U = process.env.TEST_USER_ID ?? '';
const S = 1;
/** 테스트 계정의 캐릭터가 없는 서버(스테이징의 2서버). */
const S_NO_CHAR = 2;
const TAG = `i${process.pid}x${Date.now() % 1e8}`;
const today = kstDateString();

const meleeBal = async (): Promise<number> =>
  Number(((await testDb.execute(sql`select melee_points::text mp from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { mp: string }[])[0]?.mp ?? 0);
const mileageBal = async (): Promise<number> =>
  Number(((await testDb.execute(sql`select balance::text b from mileage_wallets where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: string }[])[0]?.b ?? 0);
const ledgerByRef = async (ref: string) =>
  (await testDb.execute(sql`select kind, delta::int as delta, server_id::int as sid from point_ledger where ref = ${ref}`)) as unknown as { kind: string; delta: number; sid: number }[];

describe.skipIf(!U)('포인트 장부 — 누락·고아 행·재전송(DB 통합)', () => {
  let baseMelee = 0;
  const battles: string[] = [];

  beforeEach(async () => {
    baseMelee = await meleeBal();
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
  });
  afterEach(async () => {
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
    for (const b of battles.splice(0)) {
      await testDb.execute(sql`delete from point_ledger where ref like ${'melee:' + b + ':%'}`);
      await testDb.execute(sql`delete from melee_battles where id = ${b}::bigint`); // 참가자는 FK cascade
    }
    await testDb.execute(sql`delete from point_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`update characters set melee_points=${baseMelee} where user_id=${U}::uuid and server_id=${S}`);
    await resyncTestMileage(U);
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('캐릭터가 없는 서버에는 대난투 포인트가 적립되지 않고 원장 행도 남지 않는다', async () => {
    const [has] = (await testDb.execute(sql`select 1 as x from characters where user_id=${U}::uuid and server_id=${S_NO_CHAR}`)) as unknown as { x: number }[];
    expect(has, '테스트 계정이 2서버에 캐릭터를 만들었다면 이 테스트의 전제가 깨진다').toBeUndefined();
    const battleId = `${TAG}nochar`;
    await expect(
      testDb.transaction((tx) => creditMeleePoints(tx as never, { userId: U, serverId: S_NO_CHAR, battleId, points: 7, note: '테스트' })),
    ).rejects.toThrow(/MELEE_POINTS_CHARACTER_MISSING/);
    // 트랜잭션이 되돌려져 원장 행이 없다 — 남으면 재가입 뒤 소급 스크립트가 그 점수를 새 캐릭터에 넣는다.
    expect(await ledgerByRef(`melee:${battleId}:${U}`)).toEqual([]);
    expect(await meleeBal()).toBe(baseMelee);
  });

  it('발표 때 빠진 대난투 포인트는 다음 틱이 한 번만 채운다', async () => {
    // 방금 발표됐지만 포인트 원장 행이 없는 전투(= 적립 도중 끊긴 발표). 날짜는 먼 과거 — 화면의 '최근 전투'에 잡히지 않게.
    const [b] = (await testDb.execute(sql`
      insert into melee_battles (server_id, battle_date, seed, status, participant_count, revealed_at, computed_at)
      values (${S}, '2000-01-01'::date + (${process.pid % 300})::int, ${TAG}, 'revealed', 10, now(), now())
      returning id::text as id`)) as unknown as { id: string }[];
    battles.push(b!.id);
    await testDb.execute(sql`
      insert into melee_participants (battle_id, user_id, cp_snapshot, final_rank, reward_boxes)
      values (${b!.id}::bigint, ${U}::uuid, 1, 1, '{}'::jsonb)`);
    const pts = meleePointsForRank(1, 10);
    expect(pts).toBeGreaterThan(0);

    expect(await recreditMissingMeleePoints(S)).toBeGreaterThanOrEqual(1);
    expect(await ledgerByRef(`melee:${b!.id}:${U}`)).toEqual([{ kind: 'melee', delta: pts, sid: S }]);
    expect(await meleeBal()).toBe(baseMelee + pts);

    // 다시 돌아도 더 주지 않는다.
    await recreditMissingMeleePoints(S);
    expect(await ledgerByRef(`melee:${b!.id}:${U}`)).toHaveLength(1);
    expect(await meleeBal()).toBe(baseMelee + pts);
  });

  it('48시간이 지난 전투는 누락 보충 대상이 아니다(오래된 기록을 뒤늦게 살리지 않는다)', async () => {
    const [b] = (await testDb.execute(sql`
      insert into melee_battles (server_id, battle_date, seed, status, participant_count, revealed_at, computed_at)
      values (${S}, '2001-01-01'::date + (${process.pid % 300})::int, ${TAG + 'old'}, 'revealed', 10, now() - interval '49 hours', now() - interval '49 hours')
      returning id::text as id`)) as unknown as { id: string }[];
    battles.push(b!.id);
    await testDb.execute(sql`
      insert into melee_participants (battle_id, user_id, cp_snapshot, final_rank, reward_boxes)
      values (${b!.id}::bigint, ${U}::uuid, 1, 1, '{}'::jsonb)`);
    await recreditMissingMeleePoints(S);
    expect(await ledgerByRef(`melee:${b!.id}:${U}`)).toEqual([]);
    expect(await meleeBal()).toBe(baseMelee);
  });

  it('같은 요청 키를 화폐만 바꿔 다시 보내도 추가 횟수는 한 번만 사진다', async () => {
    await testDb.execute(sql`update characters set melee_points=50 where user_id=${U}::uuid and server_id=${S}`);
    await creditMileageForOrder(testDb, { userId: U, serverId: S, orderId: `${TAG}_o`, amountKrw: 30_000, note: '테스트 ₩30,000' }); // +300
    const mileageBefore = await mileageBal();
    const key = `${TAG}samekey`;
    const price = POINT_EXTRA_PRICES.tower[0];

    const first = await buyExtra(U, S, { item: 'tower', kind: 'melee', key, expectedPrice: price });
    expect(first).toMatchObject({ kind: 'melee', spent: price, bought: 1, duplicate: false });
    // 응답을 못 받은 클라이언트가 같은 키로, 이번엔 마일리지로 다시 보낸 상황.
    const again = await buyExtra(U, S, { item: 'tower', kind: 'mileage', key, expectedPrice: price });
    expect(again.duplicate).toBe(true);

    expect(await extrasToday(testDb, U, S, 'tower')).toBe(1);
    expect(await meleeBal()).toBe(50 - price);
    expect(await mileageBal()).toBe(mileageBefore); // 마일리지는 빠지지 않았다
    const rows = (await testDb.execute(sql`select kind, delta::int as delta from point_ledger where user_id=${U}::uuid and ref like ${'%' + key}`)) as unknown as { kind: string; delta: number }[];
    expect(rows).toEqual([{ kind: 'melee', delta: -price }]);
  });
});
