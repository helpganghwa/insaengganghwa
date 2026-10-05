import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POINT_EXTRA_PRICES, pointExtraPrice } from '@/lib/game/balance';
import { buyExtra } from '@/lib/game/points/extra';
import { PointShopError, costIn, exchangePoints, extrasToday, spendPoints } from '@/lib/game/points/spend';
import { bumpDailyOrThrow } from '@/lib/game/raid/open';
import { kstDateString } from '@/lib/kst';

import { endTestDb, sql, testDb } from '../db';

describe('추가 횟수 가격(순수)', () => {
  it('그날 산 순서대로 1 : 2 : 4, 더 못 사면 null', () => {
    expect(POINT_EXTRA_PRICES).toEqual({ expedition: [5, 10, 20], raid: [20, 40, 80], tower: [5, 10] });
    expect(pointExtraPrice('raid', 0)).toBe(20);
    expect(pointExtraPrice('raid', 2)).toBe(80);
    expect(pointExtraPrice('raid', 3)).toBeNull();
    expect(pointExtraPrice('tower', 2)).toBeNull();
    expect(pointExtraPrice('expedition', -1)).toBeNull();
  });
  it('마일리지는 ×10', () => {
    expect(costIn('melee', 20)).toBe(20);
    expect(costIn('mileage', 20)).toBe(200);
  });
});

const U = process.env.TEST_USER_ID ?? '';
const skip = !U;
const S = 1;
const TAG = `t${process.pid}x${Date.now() % 1e8}`;
let n = 0;
const key = () => `${TAG}k${++n}`;
const today = kstDateString();

type Snap = { mp: number; dia: string; boxes: Record<string, string>; tower: { loss_day: string | null; losses: number } | null; raid: number | null };

async function snap(): Promise<Snap> {
  const [c] = (await testDb.execute(sql`select melee_points::int as mp, diamond::text as dia from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { mp: number; dia: string }[];
  const bx = (await testDb.execute(sql`select slot::text as slot, count::text as c from user_supply_boxes where user_id=${U}::uuid and server_id=${S}`)) as unknown as { slot: string; c: string }[];
  const [t] = (await testDb.execute(sql`select loss_day::text as loss_day, losses from tower_progress where user_id=${U}::uuid and server_id=${S}`)) as unknown as { loss_day: string | null; losses: number }[];
  const [r] = (await testDb.execute(sql`select started_count from raid_daily_counts where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`)) as unknown as { started_count: number }[];
  return { mp: Number(c?.mp ?? 0), dia: c?.dia ?? '0', boxes: Object.fromEntries(bx.map((b) => [b.slot, b.c])), tower: t ?? null, raid: r ? Number(r.started_count) : null };
}

describe.skipIf(skip)('포인트 쓰기 — DB 통합(스테이징 테스트 계정)', () => {
  let base: Snap;
  beforeEach(async () => {
    base = await snap();
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
  });
  afterEach(async () => {
    await testDb.execute(sql`delete from point_extra_buys where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
    await testDb.execute(sql`delete from point_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`delete from diamond_ledger where user_id=${U}::uuid and ref like ${'%' + TAG + '%'}`);
    await testDb.execute(sql`update characters set melee_points=${base.mp}, diamond=${base.dia}::bigint where user_id=${U}::uuid and server_id=${S}`);
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const c = base.boxes[slot];
      if (c === undefined) await testDb.execute(sql`delete from user_supply_boxes where user_id=${U}::uuid and server_id=${S} and slot=${slot}`);
      else await testDb.execute(sql`update user_supply_boxes set count=${c}::bigint where user_id=${U}::uuid and server_id=${S} and slot=${slot}`);
    }
    if (base.tower) await testDb.execute(sql`update tower_progress set loss_day=${base.tower.loss_day}::date, losses=${base.tower.losses} where user_id=${U}::uuid and server_id=${S}`);
    if (base.raid === null) await testDb.execute(sql`delete from raid_daily_counts where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
    else await testDb.execute(sql`update raid_daily_counts set started_count=${base.raid} where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
  });
  afterAll(async () => {
    await endTestDb();
  });

  const setMp = (mp: number) => testDb.execute(sql`update characters set melee_points=${mp} where user_id=${U}::uuid and server_id=${S}`);
  const now = async () => snap();

  it('교환 💎: 10pt → 💎250, 같은 요청 키는 한 번만, 원장 기록', async () => {
    await setMp(100);
    const k = key();
    const r = await exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: k });
    expect(r).toMatchObject({ diamond: 250, boxes: 0, spent: 10, duplicate: false });
    const again = await exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: k });
    expect(again.duplicate).toBe(true);
    const s = await now();
    expect(s.mp).toBe(90);
    expect(BigInt(s.dia) - BigInt(base.dia)).toBe(250n);
    const [l] = (await testDb.execute(sql`select count(*)::int as n from diamond_ledger where user_id=${U}::uuid and reason='point_exchange_melee' and ref like ${'%' + k}`)) as unknown as { n: number }[];
    expect(l?.n).toBe(1);
  });

  it('교환 📦: 고른 부위로만 들어간다', async () => {
    await setMp(60);
    const r = await exchangePoints(U, S, { kind: 'melee', target: 'armor', pack: 50, key: key() });
    expect(r).toMatchObject({ diamond: 0, boxes: 50, slot: 'armor' });
    const s = await now();
    expect(Number(s.boxes.armor ?? 0) - Number(base.boxes.armor ?? 0)).toBe(50);
    expect(Number(s.boxes.weapon ?? 0)).toBe(Number(base.boxes.weapon ?? 0));
    expect(s.mp).toBe(10);
  });

  it('교환: 잔액 부족·잘못된 수량은 아무것도 바꾸지 않는다', async () => {
    await setMp(5);
    await expect(exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: key() })).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
    await expect(exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 7, key: key() })).rejects.toBeInstanceOf(PointShopError);
    await expect(exchangePoints(U, S, { kind: 'melee', target: 'diamond', pack: 10, key: 'bad key!' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const s = await now();
    expect(s.mp).toBe(5);
    expect(s.dia).toBe(base.dia);
  });

  it('마일리지 지출: 그 서버 지갑에서만 빠지고, 모자라면 되돌린다', async () => {
    // 결제 테스트가 1서버 지갑을 병렬로 쓰므로 실재하지 않는 서버 번호의 지갑으로 검증한다(wallet.test와 같은 이유).
    // 지출 경로(spendPoints)만 본다 — 상자·다이아 지급은 서버 FK가 있어 위 대난투 교환 테스트가 맡는다.
    const MS = 9000 + (process.pid % 900);
    await testDb.execute(sql`insert into mileage_wallets (user_id, server_id, balance) values (${U}::uuid, ${MS}, 150)
      on conflict (user_id, server_id) do update set balance = 150`);
    const bal = async () => Number(((await testDb.execute(sql`select balance::int as b from mileage_wallets where user_id=${U}::uuid and server_id=${MS}`)) as unknown as { b: number }[])[0]?.b ?? 0);
    try {
      const amount = costIn('mileage', 10);
      const ok = await testDb.transaction((tx) => spendPoints(tx as never, { userId: U, serverId: MS, kind: 'mileage', amount, note: '테스트', ref: `ex:${U}:${key()}` }));
      expect(ok).toBe(true);
      expect(await bal()).toBe(50);
      await expect(
        testDb.transaction((tx) => spendPoints(tx as never, { userId: U, serverId: MS, kind: 'mileage', amount, note: '테스트', ref: `ex:${U}:${key()}` })),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
      expect(await bal()).toBe(50);
    } finally {
      await testDb.execute(sql`delete from mileage_wallets where user_id=${U}::uuid and server_id=${MS}`);
    }
  });

  it('탑 추가 도전: 남은 도전 0일 때만, 5 → 10pt, 2번까지', async () => {
    if (!base.tower) return; // 테스트 계정에 탑 진행도가 없으면 건너뜀
    await setMp(100);
    await testDb.execute(sql`update tower_progress set loss_day=${today}::date, losses=2 where user_id=${U}::uuid and server_id=${S}`);
    await expect(buyExtra(U, S, { item: 'tower', kind: 'melee', key: key() })).rejects.toMatchObject({ code: 'NOT_NEEDED' });
    await testDb.execute(sql`update tower_progress set losses=3 where user_id=${U}::uuid and server_id=${S}`);
    const k1 = key();
    const a = await buyExtra(U, S, { item: 'tower', kind: 'melee', key: k1 });
    expect(a).toMatchObject({ spent: 5, bought: 1, next: 10, duplicate: false });
    // 같은 키 재전송 — 다시 사지 않는다(남은 도전이 1이라 검사에서 먼저 막혀도 지출은 없다).
    await buyExtra(U, S, { item: 'tower', kind: 'melee', key: k1 }).catch((e: PointShopError) => expect(e.code).toBe('NOT_NEEDED'));
    expect((await now()).mp).toBe(95);
    expect(await extrasToday(testDb, U, S, 'tower')).toBe(1);
    await testDb.execute(sql`update tower_progress set losses=4 where user_id=${U}::uuid and server_id=${S}`);
    const b = await buyExtra(U, S, { item: 'tower', kind: 'melee', key: key() });
    expect(b).toMatchObject({ spent: 10, bought: 2, next: null });
    await testDb.execute(sql`update tower_progress set losses=5 where user_id=${U}::uuid and server_id=${S}`);
    await expect(buyExtra(U, S, { item: 'tower', kind: 'melee', key: key() })).rejects.toMatchObject({ code: 'MAX_REACHED' });
    expect((await now()).mp).toBe(85);
  });

  it('레이드 +1회: 한도가 찼을 때만, 산 만큼 하루 한도가 늘어난다', async () => {
    await setMp(200);
    await testDb.execute(sql`
      insert into raid_daily_counts (user_id, server_id, kst_date, started_count) values (${U}::uuid, ${S}, ${today}::date, 4)
      on conflict (user_id, server_id, kst_date) do update set started_count = 4`);
    await expect(buyExtra(U, S, { item: 'raid', kind: 'melee', key: key() })).rejects.toMatchObject({ code: 'NOT_NEEDED' });
    await testDb.execute(sql`update raid_daily_counts set started_count=5 where user_id=${U}::uuid and server_id=${S} and kst_date=${today}::date`);
    const r = await buyExtra(U, S, { item: 'raid', kind: 'melee', key: key() });
    expect(r).toMatchObject({ spent: 20, bought: 1, next: 40 });
    // 6번째가 통과하고 동시 한도도 하나 늘어난다 — 확인 후 되돌린다(롤백).
    const cap = await testDb
      .transaction(async (tx) => {
        const c = await bumpDailyOrThrow(tx as never, U, S);
        throw Object.assign(new Error('rollback'), { c });
      })
      .catch((e: { c?: { concurrentCap: number } }) => e.c);
    expect(cap?.concurrentCap).toBe(6);
    expect((await now()).mp).toBe(180);
  });

  it('잔액 부족이면 횟수도 지출도 그대로', async () => {
    await setMp(3);
    await testDb.execute(sql`
      insert into raid_daily_counts (user_id, server_id, kst_date, started_count) values (${U}::uuid, ${S}, ${today}::date, 5)
      on conflict (user_id, server_id, kst_date) do update set started_count = 5`);
    await expect(buyExtra(U, S, { item: 'raid', kind: 'melee', key: key() })).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
    expect(await extrasToday(testDb, U, S, 'raid')).toBe(0);
    expect((await now()).mp).toBe(3);
  });

  it('파견 다시 보내기: 오늘 완료 칸만, 사면 그 칸에 새 파견지', async () => {
    const busy = (await testDb.execute(sql`select 1 from expeditions where user_id=${U}::uuid and server_id=${S} and slot=1 and status='running'`)) as unknown as unknown[];
    if (busy.length > 0) return; // 진행 중이면 건드리지 않는다
    await setMp(50);
    await testDb.execute(sql`delete from expeditions where user_id=${U}::uuid and server_id=${S} and slot=1 and status='offer'`);
    // 아직 오늘 안 보낸 칸 → 살 필요 없음
    const startedToday = (await testDb.execute(sql`
      select 1 from expeditions where user_id=${U}::uuid and server_id=${S} and slot=1 and started_at is not null
        and (started_at at time zone 'Asia/Seoul')::date = ${today}::date`)) as unknown as unknown[];
    let fakeId: string | null = null;
    if (startedToday.length === 0) {
      await expect(buyExtra(U, S, { item: 'expedition', kind: 'melee', slot: 1, key: key() })).rejects.toMatchObject({ code: 'NOT_NEEDED' });
      const [f] = (await testDb.execute(sql`
        insert into expeditions (user_id, server_id, slot, region, difficulty, duration_ms, reward, status, started_at, complete_at, claimed_at, final_reward)
        values (${U}::uuid, ${S}, 1, 'swamp', 'normal', 28800000, '{"kind":"dia","diamond":1}'::jsonb, 'claimed', now(), now(), now(), '{"kind":"dia","diamond":1}'::jsonb)
        returning id::text as id`)) as unknown as { id: string }[];
      fakeId = f!.id;
    }
    try {
      const r = await buyExtra(U, S, { item: 'expedition', kind: 'melee', slot: 1, key: key() });
      expect(r).toMatchObject({ spent: 5, bought: 1, slot: 1 });
      const offer = (await testDb.execute(sql`select 1 from expeditions where user_id=${U}::uuid and server_id=${S} and slot=1 and status='offer'`)) as unknown as unknown[];
      expect(offer.length).toBe(1);
      // 오퍼가 생긴 칸은 다시 살 수 없다(진행 가능 상태)
      await expect(buyExtra(U, S, { item: 'expedition', kind: 'melee', slot: 1, key: key() })).rejects.toMatchObject({ code: 'NOT_NEEDED' });
      expect((await now()).mp).toBe(45);
    } finally {
      await testDb.execute(sql`delete from expeditions where user_id=${U}::uuid and server_id=${S} and slot=1 and status='offer'`);
      if (fakeId) await testDb.execute(sql`delete from expeditions where id=${fakeId}::bigint`);
    }
  });
});
