import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POINT_EXTRA_PRICES, TOWER_POOL_PER_SLOT, TOWER_SPECIAL_POOL_PER_SLOT } from '@/lib/game/balance';
import { buyExtra } from '@/lib/game/points/extra';
import { PointShopError } from '@/lib/game/points/spend';
import { towerRerollableFloor } from '@/lib/game/tower/service';
import { kstDateString, kstWeekStartString } from '@/lib/kst';

import { endTestDb, sql, testDb } from '../db';

/** 무한의 탑 요구 장비 다시 뽑기(0245) — 포인트 상점 트랜잭션으로 그 층의 3부위를 나에게만 새로 뽑는다. 스테이징 테스트 계정, 뒤처리로 원복. */
const U = process.env.TEST_USER_ID ?? '';
const S = 1;
const TAG = `rr${process.pid}x${Date.now() % 1e8}`;
let n = 0;
const key = () => `${TAG}k${++n}`;
const today = kstDateString();
const week = kstWeekStartString();

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof PointShopError ? e.code : `THROWN:${String(e)}`;
  }
};

describe('다시 뽑을 수 있는 층(순수)', () => {
  it('11층부터 열린 맨 위 층까지', () => {
    expect(towerRerollableFloor(10)).toBe(false);
    expect(towerRerollableFloor(11)).toBe(true);
    expect(towerRerollableFloor(20)).toBe(true);
    expect(towerRerollableFloor(11.5)).toBe(false);
    expect(towerRerollableFloor(999)).toBe(false);
    expect(POINT_EXTRA_PRICES.tower_reroll).toEqual([10, 20, 40]);
  });
});

describe.skipIf(!U)('요구 장비 다시 뽑기 — DB 통합', () => {
  let mp = 0;
  beforeEach(async () => {
    const [c] = (await testDb.execute(sql`select melee_points::int as mp from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { mp: number }[];
    mp = Number(c?.mp ?? 0);
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date and item='tower_reroll'`);
    await testDb.execute(sql`delete from tower_pool_rerolls where user_id=${U}::uuid and server_id=${S}`);
    await testDb.execute(sql`update characters set melee_points=200 where user_id=${U}::uuid and server_id=${S}`);
  });
  afterEach(async () => {
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date and item='tower_reroll'`);
    await testDb.execute(sql`delete from tower_pool_rerolls where user_id=${U}::uuid and server_id=${S}`);
    await testDb.execute(sql`delete from point_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`update characters set melee_points=${mp} where user_id=${U}::uuid and server_id=${S}`);
  });
  afterAll(endTestDb);

  const rowOf = async (floor: number) => {
    const [r] = (await testDb.execute(sql`select weapon, armor, accessory from tower_pool_rerolls where user_id=${U}::uuid and server_id=${S} and week_start=${week}::date and floor=${floor}`)) as unknown as { weapon: string[]; armor: string[]; accessory: string[] }[];
    return r ?? null;
  };

  it('일반 층은 부위별 10개, 특별층은 1개를 새로 뽑아 내 행으로 박제 · 같은 키는 한 번만, 저장된 것을 돌려줌', async () => {
    const k = key();
    const r = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: k, floor: 25 });
    expect(r).toMatchObject({ item: 'tower_reroll', qty: 1, spent: 10, bought: 1, next: 20, duplicate: false, floor: 25 });
    expect(r.pool!.weapon).toHaveLength(TOWER_POOL_PER_SLOT);
    expect(new Set(r.pool!.armor).size).toBe(TOWER_POOL_PER_SLOT);
    const saved = await rowOf(25);
    expect(saved!.weapon).toEqual(r.pool!.weapon);
    const again = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: k, floor: 25 });
    expect(again.duplicate).toBe(true);
    expect(again.pool!.accessory).toEqual(r.pool!.accessory);
    const sp = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 30 });
    expect(sp.spent).toBe(20);
    expect(sp.pool!.weapon).toHaveLength(TOWER_SPECIAL_POOL_PER_SLOT);
    expect(await rowOf(30)).not.toBeNull();
  });

  it('같은 층을 다시 뽑으면 덮어쓴다 · 하루 3번(10·20·40) 뒤에는 MAX_REACHED', async () => {
    const a = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 41 });
    const b = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 41 });
    expect(b.spent).toBe(20);
    expect((await rowOf(41))!.weapon).toEqual(b.pool!.weapon);
    expect(a.pool!.weapon.length).toBe(b.pool!.weapon.length);
    const c = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 41 });
    expect(c.spent).toBe(40);
    expect(c.next).toBeNull();
    expect(await code(buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 41 }))).toBe('MAX_REACHED');
    const [ch] = (await testDb.execute(sql`select melee_points::int as mp from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { mp: number }[];
    expect(Number(ch!.mp)).toBe(200 - 70);
  });

  it('화면이 본 주가 지금 주와 다르면 WEEK_CHANGED, 같으면 통과', async () => {
    expect(await code(buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 25, week: '2000-01-03' }))).toBe('WEEK_CHANGED');
    expect(await rowOf(25)).toBeNull();
    const r = await buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 25, week });
    expect(r.duplicate).toBe(false);
    expect(await rowOf(25)).not.toBeNull();
  });

  it('층이 없거나 범위 밖이면 BAD_REQUEST · 다른 상품에 온 층은 무시', async () => {
    expect(await code(buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key() }))).toBe('BAD_REQUEST');
    expect(await code(buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 5 }))).toBe('BAD_REQUEST');
    expect(await code(buyExtra(U, S, { item: 'tower_reroll', kind: 'melee', key: key(), floor: 9999 }))).toBe('BAD_REQUEST');
    expect(await rowOf(5)).toBeNull();
  });
});
