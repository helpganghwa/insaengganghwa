import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { towerHuntBox, towerHuntRange, towerHuntReward } from '@/lib/game/balance';
import { claimTowerRewards, challengeTower, TowerError } from '@/lib/game/tower/service';
import { kstWeekStartString } from '@/lib/kst';

import { endTestDb, sql, testDb } from '../db';

// 무한의 탑 트랜잭션(도전·보상 받기) — 스테이징 테스트 계정의 실제 DB 경로. 진행도·전투·수령·다이아는 끝나면 원래대로 되돌린다.
// 판정 RNG는 주입: 항상 9999 = 빗나감·급소 없이 내가 먼저 쳐 이김, 항상 0 = 둘 다 빗나가 최대 턴을 넘겨 짐.
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const S = 1;
const NO_SERVER = 32000; // 캐릭터가 없는 서버 번호
const WIN = () => 9999;
const LOSE = () => 0;
let seq = 0;
const key = () => `towertest-${process.pid}-${++seq}-${Date.now()}`;

describe.skipIf(skip)('무한의 탑 도전·보상(DB 통합)', () => {
  const started = new Date();
  let saved: { best_floor: number; best_at: string | null; loss_day: string | null; losses: number; last_profile_id: string | null } | null = null;
  let diamond = '0';
  let claims: { floor: number; at: string }[] = [];
  let boxes: { slot: string; count: number }[] = [];

  beforeAll(async () => {
    const [p] = (await testDb.execute(sql`select best_floor, best_at, loss_day::text as loss_day, losses, last_profile_id::text as last_profile_id
      from tower_progress where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as NonNullable<typeof saved>[];
    saved = p ?? null;
    const [c] = (await testDb.execute(sql`select diamond::text d from characters where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { d: string }[];
    diamond = c!.d;
    boxes = (await testDb.execute(sql`select slot::text as slot, count from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { slot: string; count: number }[];
    // 0층·오늘 진 판 0에서 시작, 이 테스트 전의 수령 기록은 잠시 치워 둔다(끝나면 되돌림).
    await testDb.execute(sql`insert into tower_progress (user_id, server_id) values (${TEST_USER_ID}::uuid, ${S}) on conflict do nothing`);
    await testDb.execute(sql`update tower_progress set best_floor=0, best_at=null, losses=0, loss_day=null where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    claims = (await testDb.execute(sql`select floor, claimed_at::text as at from tower_claims where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { floor: number; at: string }[];
    await testDb.execute(sql`delete from tower_claims where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
  });

  afterAll(async () => {
    await testDb.execute(sql`delete from tower_battles where user_id=${TEST_USER_ID}::uuid and created_at >= ${started.toISOString()}::timestamptz`);
    await testDb.execute(sql`delete from tower_claims where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    for (const c of claims) {
      await testDb.execute(sql`insert into tower_claims (user_id, server_id, floor, claimed_at) values (${TEST_USER_ID}::uuid, ${S}, ${c.floor}, ${c.at}::timestamptz)`);
    }
    await testDb.execute(sql`delete from diamond_ledger where user_id=${TEST_USER_ID}::uuid and (ref like 'tower:%' or ref like 'tower-hunt:%') and created_at >= ${started.toISOString()}::timestamptz`);
    await testDb.execute(sql`update characters set diamond=${diamond}::bigint where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    if (saved) {
      await testDb.execute(sql`update tower_progress set best_floor=${saved.best_floor}, best_at=${saved.best_at}::timestamptz, losses=${saved.losses},
        loss_day=${saved.loss_day}::date, last_profile_id=${saved.last_profile_id}::uuid where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    } else {
      await testDb.execute(sql`delete from tower_progress where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    }
    // 상자는 맨 끝에(앞 단계가 실패해도 진행도·다이아는 먼저 되돌아가게).
    for (const b of boxes) {
      await testDb.execute(sql`update user_supply_boxes set count=${b.count} where user_id=${TEST_USER_ID}::uuid and server_id=${S} and slot::text=${b.slot}`);
    }
    await endTestDb();
  });

  it('캐릭터가 없는 서버면 NO_CHARACTER — 그 서버의 요구 장비는 뽑지 않는다(쿠키 조작 방지)', async () => {
    await expect(challengeTower(TEST_USER_ID, NO_SERVER, 1, null, { idemKey: key(), rng: WIN })).rejects.toMatchObject({ code: 'NO_CHARACTER' });
    const r = (await testDb.execute(sql`select count(*)::int n from tower_pools where server_id=${NO_SERVER}`)) as unknown as { n: number }[];
    expect(r[0]!.n).toBe(0);
  });

  it('다음 층이 아니면 NOT_NEXT_FLOOR', async () => {
    await expect(challengeTower(TEST_USER_ID, S, 3, null, { idemKey: key(), rng: WIN })).rejects.toBeInstanceOf(TowerError);
  });

  it('이긴 판: 최고 층 +1·도전 차감 없음, 같은 키 재전송은 저장된 결과만(다시 오르지 않음)', async () => {
    const k = key();
    const a = await challengeTower(TEST_USER_ID, S, 1, null, { idemKey: k, rng: WIN });
    expect(a.win).toBe(true);
    expect(a.best).toBe(1);
    expect(a.attemptsLeft).toBe(3);
    const b = await challengeTower(TEST_USER_ID, S, 1, null, { idemKey: k, rng: LOSE });
    expect(b.battleId).toBe(a.battleId);
    expect(b.win).toBe(true);
  });

  it('진 판: 도전 1 차감, 같은 키 재전송·동시 요청은 한 번만 차감', async () => {
    const k = key();
    const [a, b] = await Promise.all([
      challengeTower(TEST_USER_ID, S, 2, null, { idemKey: k, rng: LOSE }),
      challengeTower(TEST_USER_ID, S, 2, null, { idemKey: k, rng: LOSE }),
    ]);
    expect(a.win).toBe(false);
    expect(b.battleId).toBe(a.battleId);
    expect(a.attemptsLeft).toBe(2);
    expect(b.attemptsLeft).toBe(2);
    const rows = (await testDb.execute(sql`select count(*)::int n from tower_battles where user_id=${TEST_USER_ID}::uuid and idem_key=${k}`)) as unknown as { n: number }[];
    expect(rows[0]!.n).toBe(1);
  });

  it('하루 3번 지면 NO_ATTEMPTS — 막힌 도전은 기록도 차감도 없다', async () => {
    await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), rng: LOSE });
    const last = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), rng: LOSE });
    expect(last.attemptsLeft).toBe(0);
    await expect(challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), rng: WIN })).rejects.toMatchObject({ code: 'NO_ATTEMPTS' });
  });

  it('남의 아바타·없는 아바타는 BAD_AVATAR', async () => {
    await testDb.execute(sql`update tower_progress set losses=0 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    await expect(
      challengeTower(TEST_USER_ID, S, 2, '00000000-0000-4000-8000-000000000000', { idemKey: key(), rng: WIN }),
    ).rejects.toMatchObject({ code: 'BAD_AVATAR' });
  });

  it('보상 받기: 동시에 두 번 눌러도 한 번만, 돌파하지 않은 층·이상한 층은 무시', async () => {
    const [x, y] = await Promise.all([claimTowerRewards(TEST_USER_ID, S, null), claimTowerRewards(TEST_USER_ID, S, null)]);
    expect([...x.floors, ...y.floors]).toEqual([1]);
    expect(x.diamond + y.diamond).toBe(20);
    expect((await claimTowerRewards(TEST_USER_ID, S, null)).floors).toEqual([]);
    expect((await claimTowerRewards(TEST_USER_ID, S, [5, -1, 0, 1e9])).floors).toEqual([]);
  });
  it('같은 요청 키라도 다른 서버의 전투 결과는 돌려주지 않는다(서버별 멱등)', async () => {
    await testDb.execute(sql`update tower_progress set losses=0 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    const k = key();
    const [other] = (await testDb.execute(sql`
      insert into tower_battles (user_id, server_id, floor, win, tower_cp, requirement, pieces, turns, key_turn, idem_key)
      values (${TEST_USER_ID}::uuid, 2, 30, true, 1, 1, '[]'::jsonb, '[]'::jsonb, 0, ${k}) returning id::text as id`)) as unknown as { id: string }[];
    const r = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: k, rng: LOSE });
    expect(r.battleId).not.toBe(other!.id);
    expect(r.floor).toBe(2);
    expect(r.win).toBe(false);
  });
  it('주가 바뀐 화면의 도전은 POOL_CHANGED(차감 없음)', async () => {
    await expect(challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), week: '2000-01-03', rng: WIN })).rejects.toMatchObject({ code: 'POOL_CHANGED' });
  });

  it('어제 진 기록은 오늘 도전 수에 들어가지 않는다(KST 자정 초기화)', async () => {
    await testDb.execute(sql`update tower_progress set losses=3, loss_day=(now() at time zone 'Asia/Seoul')::date - 1
      where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    const r = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), rng: LOSE });
    expect(r.attemptsLeft).toBe(2);
  });

  it('꼭대기까지 오르면 TOP_REACHED', async () => {
    await testDb.execute(sql`update tower_progress set best_floor=100, losses=0 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    await expect(challengeTower(TEST_USER_ID, S, 101, null, { idemKey: key(), rng: WIN })).rejects.toMatchObject({ code: 'TOP_REACHED' });
  });

  it('5층 보상 받기 — 💎와 보급 상자(부위마다 3분의 1)', async () => {
    await testDb.execute(sql`update tower_progress set best_floor=5 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    const before = (await testDb.execute(sql`select slot::text as slot, count from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { slot: string; count: number }[];
    const r = await claimTowerRewards(TEST_USER_ID, S, [5]);
    expect(r.floors).toEqual([5]);
    expect(r.boxes).toBe(6);
    const after = (await testDb.execute(sql`select slot::text as slot, count from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { slot: string; count: number }[];
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const b = before.find((x) => x.slot === slot)?.count ?? 0;
      const a = after.find((x) => x.slot === slot)?.count ?? 0;
      expect(a - b).toBe(2);
    }
  });
  it('토벌: 돌파한 층만 — 이겨도 도전 1 차감·💎 즉시 지급, 최고 층은 그대로', async () => {
    await testDb.execute(sql`update tower_progress set best_floor=2, losses=0 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    await expect(challengeTower(TEST_USER_ID, S, 3, null, { idemKey: key(), rng: WIN, hunt: true })).rejects.toMatchObject({ code: 'NOT_CLEARED' });
    const [c0] = (await testDb.execute(sql`select diamond::text d from characters where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { d: string }[];
    const k = key();
    const a = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: k, rng: WIN, hunt: true });
    expect(a.win).toBe(true);
    expect(a.hunt).toBe(true);
    expect(a.best).toBe(2);
    expect(a.attemptsLeft).toBe(2);
    expect(a.reward?.diamond).toBe(towerHuntReward(2));
    expect(BigInt(a.diamondBalance!)).toBe(BigInt(c0!.d) + BigInt(towerHuntReward(2)));
    // 같은 키 재전송은 다시 지급하지 않는다.
    const b = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: k, rng: WIN, hunt: true });
    expect(b.battleId).toBe(a.battleId);
    const [c1] = (await testDb.execute(sql`select diamond::text d from characters where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { d: string }[];
    expect(BigInt(c1!.d)).toBe(BigInt(c0!.d) + BigInt(towerHuntReward(2)));
    // 진 토벌도 1 차감, 보상 없음.
    const l = await challengeTower(TEST_USER_ID, S, 1, null, { idemKey: key(), rng: LOSE, hunt: true });
    expect(l.win).toBe(false);
    expect(l.attemptsLeft).toBe(1);
    const [p] = (await testDb.execute(sql`select best_floor from tower_progress where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { best_floor: number }[];
    expect(p!.best_floor).toBe(2);
  });
  it('토벌 전리품: 범위 최소 ×2 더블·상자(부위마다 3분의 1) — 굴림 0이면 셋 다 터진다', async () => {
    await testDb.execute(sql`update tower_progress set best_floor=2, losses=0 where user_id=${TEST_USER_ID}::uuid and server_id=${S}`);
    const before = (await testDb.execute(sql`select slot::text as slot, count from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { slot: string; count: number }[];
    const r = await challengeTower(TEST_USER_ID, S, 2, null, { idemKey: key(), rng: WIN, hunt: true, bonusRng: () => 0 });
    expect(r.reward).toEqual({ diamond: towerHuntRange(2).min * 2, boxes: towerHuntBox(2), double: true });
    const after = (await testDb.execute(sql`select slot::text as slot, count from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${S}`)) as unknown as { slot: string; count: number }[];
    for (const slot of ['weapon', 'armor', 'accessory']) {
      const b = before.find((x) => x.slot === slot)?.count ?? 0;
      const a = after.find((x) => x.slot === slot)?.count ?? 0;
      expect(a - b).toBe(towerHuntBox(2) / 3);
    }
  });
  it('이번 주 요구 장비: 11~100층 90층, 일반 층 부위별 10개·특별층 부위별 1개', async () => {
    const rows = (await testDb.execute(sql`select floor, cardinality(weapon) w, cardinality(armor) a, cardinality(accessory) c from tower_pools
      where server_id=${S} and week_start=${kstWeekStartString()}::date`)) as unknown as { floor: number; w: number; a: number; c: number }[];
    expect(rows).toHaveLength(90);
    for (const r of rows) {
      const n = Number(r.floor) % 10 === 0 ? 1 : 10;
      expect([Number(r.w), Number(r.a), Number(r.c)]).toEqual([n, n, n]);
    }
  });
});
