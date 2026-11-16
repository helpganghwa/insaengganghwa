import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorldBossError } from '@/lib/game/world-boss/errors';
import { runSolo } from '@/lib/game/world-boss/solo-server';
import { getSoloBossDetail, getSoloReplay } from '@/lib/game/world-boss/solo-queries';
import { settleLeftBosses } from '@/lib/game/world-boss/spawn';
import { spawnWorldBossByAdmin } from '@/lib/game/world-boss/admin';

import { endTestDb, sql, testDb } from '../db';

/**
 * 개인 월드보스(0253) 통합 테스트(스테이징 DB) — 테스트 계정의 거주지를 보스와 다른 구역으로 두고(거주 조건 없음, 11-14)
 * 도전(무료 1판) → 남은 판 없음 → 정산(순위·보상·우편)을 실제 표에서 돌린다. 끝나면 되돌린다.
 */
const T = process.env.TEST_USER_ID ?? '';
const G = '9ea03a3c-41f2-4f4b-b793-da16a14402b2'; // 규규 — 다른 구역 거주자
const S = 1;
const ZONE = 2; // 원정대 생애 테스트(lifecycle, 구역 1)와 동시에 돌아도 겹치지 않게
const q = async <R,>(s: ReturnType<typeof sql>): Promise<R[]> => (await testDb.execute(s)) as unknown as R[];
const code = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'OK'; } catch (e) { return e instanceof WorldBossError ? e.code : `THROWN:${(e as Error).message}`; }
};

describe.skipIf(!T)('개인 월드보스 — 도전·정산(DB 통합)', () => {
  let homeBefore: number | null = null;
  let gHomeBefore: number | null = null;
  let bossId = '';
  const t0 = new Date();

  beforeAll(async () => {
    await testDb.execute(sql`delete from world_bosses where server_id=${S} and kst_day < '2001-01-01'`);
    const [c] = await q<{ home: number | null }>(sql`select residence_zone_id as home from characters where user_id=${T}::uuid and server_id=${S}`);
    homeBefore = c?.home ?? null;
    const [g] = await q<{ home: number | null }>(sql`select residence_zone_id as home from characters where user_id=${G}::uuid and server_id=${S}`);
    gHomeBefore = g?.home ?? null;
    // 보스와 다른 구역에 살아도 도전할 수 있어야 한다(거주 조건 삭제, 11-14).
    await testDb.execute(sql`update characters set residence_zone_id=${ZONE + 1} where user_id=${T}::uuid and server_id=${S}`);
    if (gHomeBefore === ZONE) await testDb.execute(sql`update characters set residence_zone_id=3 where user_id=${G}::uuid and server_id=${S}`);
    // 요구 장비 = 테스트 계정이 지금 장착한 것(전투력이 0이 아니게).
    const eq = await q<{ code: string; slot: string }>(sql`
      select ci.code, ci.slot::text as slot from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.user_id=${T}::uuid and ue.server_id=${S} and ue.equipped_slot is not null and ci.active`);
    expect(eq.length, '테스트 계정이 장비를 장착하고 있어야 한다').toBeGreaterThan(0);
    const pool = { weapon: eq.filter((e) => e.slot === 'weapon').map((e) => e.code), armor: eq.filter((e) => e.slot === 'armor').map((e) => e.code), accessory: eq.filter((e) => e.slot === 'accessory').map((e) => e.code) };
    const [b] = await q<{ id: string }>(sql`
      insert into world_bosses (server_id, zone_id, region, boss_code, kst_day, spawn_at, leave_at, status, pool)
      values (${S}, ${ZONE}, 'volcano', 'shadow_queen', '2000-01-05'::date, now() - interval '1 minute', now() + interval '2 days', 'active', ${JSON.stringify(pool)}::jsonb)
      returning id::text as id`);
    bossId = b!.id;
  });

  afterAll(async () => {
    await testDb.execute(sql`delete from mailbox where user_id=${T}::uuid and type='world_boss' and created_at >= ${t0.toISOString()}::timestamptz`);
    if (bossId) await testDb.execute(sql`delete from world_bosses where id=${bossId}::bigint`);
    await testDb.execute(sql`update characters set residence_zone_id=${homeBefore} where user_id=${T}::uuid and server_id=${S}`);
    await testDb.execute(sql`update characters set residence_zone_id=${gHomeBefore} where user_id=${G}::uuid and server_id=${S}`);
    await endTestDb();
  });

  it('다른 구역 거주자도 무료 1판 → 기록·누적, 재전송은 같은 판, 남은 판 없으면 NO_RUNS', async () => {
    const key = crypto.randomUUID();
    const r = await runSolo(T, S, bossId, key);
    expect(r.hits).toHaveLength(10);
    expect(r.score).toBe(r.hits.reduce((a, h) => a + h.d, 0));
    expect(r.paid).toBe(false);
    expect(r.prevBest).toBeNull();
    expect(r.rank).toBe(1);
    expect(r.runsLeft).toBe(0);
    const again = await runSolo(T, S, bossId, key);
    expect(again.replayed).toBe(true);
    expect(again.runId).toBe(r.runId);
    expect(await code(runSolo(T, S, bossId, crypto.randomUUID()))).toBe('NO_RUNS');
    // 재도전은 보스별(slot = 구역 id) — 다른 구역 여왕에서 산 재도전으로는 이 여왕에 못 들어온다.
    const day = (await q<{ d: string }>(sql`select (now() at time zone 'Asia/Seoul')::date::text as d`))[0]!.d;
    const before = await q<{ slot: number; count: number }>(sql`select slot, count from point_extra_buys where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date and item='wb_retry'`);
    try {
      await testDb.execute(sql`delete from point_extra_buys where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date and item='wb_retry'`);
      await testDb.execute(sql`insert into point_extra_buys (user_id, server_id, kst_date, item, slot, count) values (${T}::uuid, ${S}, ${day}::date, 'wb_retry', ${ZONE + 1}, 1)`);
      expect(await code(runSolo(T, S, bossId, crypto.randomUUID()))).toBe('NO_RUNS');
      expect((await getSoloBossDetail(bossId, S, T))?.me).toMatchObject({ retryLeft: 0 });
      // 같은 구역에 오늘 먼저 떠난 여왕에서 산 재도전을 이미 썼다면 이 여왕에서 다시 쓰지 못한다(산 횟수·쓴 횟수 모두 구역·날짜 기준).
      await testDb.execute(sql`insert into point_extra_buys (user_id, server_id, kst_date, item, slot, count) values (${T}::uuid, ${S}, ${day}::date, 'wb_retry', ${ZONE}, 1)`);
      const [prevBoss] = await q<{ id: string }>(sql`
        insert into world_bosses (server_id, zone_id, region, boss_code, kst_day, spawn_at, leave_at, status, pool)
        values (${S}, ${ZONE}, 'volcano', 'shadow_queen', '2000-01-06'::date, now() - interval '3 days', now() - interval '1 day', 'left', '{}'::jsonb) returning id::text as id`);
      try {
        await testDb.execute(sql`insert into world_boss_solo_runs (boss_id, user_id, server_id, kst_date, paid, score, hits, power, idem_key)
          values (${prevBoss!.id}::bigint, ${T}::uuid, ${S}, ${day}::date, true, 1, '[]'::jsonb, '{}'::jsonb, gen_random_uuid())`);
        expect(await code(runSolo(T, S, bossId, crypto.randomUUID()))).toBe('NO_RUNS');
        expect((await getSoloBossDetail(bossId, S, T))?.me).toMatchObject({ retryLeft: 0 });
      } finally {
        await testDb.execute(sql`delete from world_bosses where id=${prevBoss!.id}::bigint`);
      }
    } finally {
      await testDb.execute(sql`delete from point_extra_buys where user_id=${T}::uuid and server_id=${S} and kst_date=${day}::date and item='wb_retry'`);
      for (const r of before) await testDb.execute(sql`insert into point_extra_buys (user_id, server_id, kst_date, item, slot, count) values (${T}::uuid, ${S}, ${day}::date, 'wb_retry', ${r.slot}, ${r.count})`);
    }
    const [b] = await q<{ total: string }>(sql`select total_damage::text as total from world_bosses where id=${bossId}::bigint`);
    expect(Number(b!.total)).toBe(r.score);

    const d = await getSoloBossDetail(bossId, S, T);
    expect(d?.top[0]).toMatchObject({ rank: 1, best: r.score, me: true });
    expect(d?.me).toMatchObject({ best: r.score, rank: 1, freeLeft: 0, retryLeft: 0 });
  }, 20_000); // 스테이징 왕복이 많아(재도전 구역 기준 확인까지) 기본 5초로는 느린 날 넘친다.

  it('내 도전 기록·다시 보기 — 목록은 최신 순, 다시 보기 값은 그 판 시각 기준(뒤에 생긴 기록은 섞이지 않는다)', async () => {
    const [mine] = await q<{ id: string; at: string; score: string }>(sql`select id::text as id, created_at::text as at, score::text as score from world_boss_solo_runs where boss_id=${bossId}::bigint and user_id=${T}::uuid`);
    const ins = async (user: string, score: number, at: string) =>
      (await q<{ id: string }>(sql`insert into world_boss_solo_runs (boss_id, user_id, server_id, kst_date, paid, score, hits, power, idem_key, created_at)
        values (${bossId}::bigint, ${user}::uuid, ${S}, (now() at time zone 'Asia/Seoul')::date, true, ${score}, '[]'::jsonb, '{"weapon":1,"armor":1,"accessory":1}'::jsonb, gen_random_uuid(), ${at}::timestamptz) returning id::text as id`))[0]!.id;
    const made: string[] = [];
    try {
      const at = mine!.at;
      // 그 판 전: 내 낮은 판 1, 남의 판 1(내 판보다 낮게). 그 판 뒤: 남의 아주 큰 판, 내 판.
      made.push(await ins(T, 5, new Date(Date.parse(at) - 60_000).toISOString()));
      made.push(await ins(G, 3, new Date(Date.parse(at) - 30_000).toISOString()));
      made.push(await ins(G, 9e15, new Date(Date.parse(at) + 30_000).toISOString()));
      made.push(await ins(T, 7, new Date(Date.parse(at) + 60_000).toISOString()));
      const d = await getSoloBossDetail(bossId, S, T);
      expect(d?.me?.runs.map((r) => r.score)).toEqual([7, Number(mine!.score), 5]);
      const r = await getSoloReplay(T, S, bossId, mine!.id);
      expect(r?.run).toMatchObject({ score: Number(mine!.score), prevBest: 5, best: Number(mine!.score), rank: 1, prevRank: 1, totalBefore: 8, dealt: 5 + Number(mine!.score) });
      expect(r?.ladder).toEqual([3]);
      expect(await getSoloReplay(G, S, bossId, mine!.id)).toBeNull(); // 남의 판은 못 연다
    } finally {
      for (const id of made) await testDb.execute(sql`delete from world_boss_solo_runs where id=${id}::bigint`);
    }
  }, 20_000);

  it('여왕이 떠 있으면 다른 구역에도 여왕을 더 띄울 수 없다(서버당 하나)', async () => {
    const r = await spawnWorldBossByAdmin({ serverId: S, zoneId: ZONE + 2, spawnAt: null, adminUserId: T, allowOverlap: true, allowNearMidnight: true, bossCode: 'shadow_queen' });
    expect(r).toMatchObject({ ok: false, code: 'SOLO_BUSY' });
  }, 20_000);

  it('재가입 전 캐릭터의 기록(캐릭터 생성 전 best_at)은 순위표·정산에 들지 않는다(11-16 검수 C2)', async () => {
    // 규규가 이 캐릭터를 만들기 전에 세운 것처럼 — 아주 큰 기록을 2000년 시각으로 넣는다. 들어가면 테스트 계정이 1위를 잃는다.
    await testDb.execute(sql`
      insert into world_boss_solo_records (boss_id, user_id, server_id, best, best_at, best_run_id, runs)
      values (${bossId}::bigint, ${G}::uuid, ${S}, 999999999999, '2000-01-01T00:00:00Z'::timestamptz, 0, 1)`);
    const d = await getSoloBossDetail(bossId, S, T);
    expect(d!.top.some((r) => r.userId === G)).toBe(false);
  });

  it('사라질 때 순위·보상을 적고 결과 우편을 보낸다', async () => {
    await testDb.execute(sql`update world_bosses set leave_at = now() - interval '1 second' where id=${bossId}::bigint`);
    const out = await settleLeftBosses(S, { onlyBossIds: [bossId] });
    expect(out.map((x) => x.id)).toContain(bossId);
    const [rec] = await q<{ final_rank: number; reward_diamond: number; reward_boxes: number }>(sql`
      select final_rank, reward_diamond, reward_boxes from world_boss_solo_records where boss_id=${bossId}::bigint and user_id=${T}::uuid`);
    expect(rec!.final_rank).toBe(1);
    // 혼자 친 보스 — 기여도 100%: (참가 80 + 기여 9,000) × 페이즈 보너스 + 1위 2,500.
    expect(rec!.reward_diamond).toBeGreaterThanOrEqual(2500 + 9_080);
    expect(rec!.reward_boxes % 3).toBe(0);
    const mails = await q<{ title: string; body: string; payload: { diamond: number; boxes: Record<string, number> } }>(sql`
      select title, body, payload from mailbox where user_id=${T}::uuid and type='world_boss' and created_at >= ${t0.toISOString()}::timestamptz`);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.title).toBe('그림자 거미 여왕 결과');
    expect(mails[0]!.body).toContain('기여도 100.0%');
    expect(mails[0]!.payload.diamond).toBe(rec!.reward_diamond);
    expect(mails[0]!.payload.boxes.weapon * 3).toBe(rec!.reward_boxes);
    const [b] = await q<{ status: string }>(sql`select status from world_bosses where id=${bossId}::bigint`);
    expect(b!.status).toBe('left');
    // 재가입 전 기록은 정산에서도 빠진다 — 순위·보상 없음, 우편 없음.
    const [gRec] = await q<{ final_rank: number | null; reward_diamond: number }>(sql`
      select final_rank, reward_diamond from world_boss_solo_records where boss_id=${bossId}::bigint and user_id=${G}::uuid`);
    expect(gRec!.final_rank).toBeNull();
    expect(gRec!.reward_diamond).toBe(0);
    const gMails = await q(sql`select 1 from mailbox where user_id=${G}::uuid and type='world_boss' and created_at >= ${t0.toISOString()}::timestamptz`);
    expect(gMails).toHaveLength(0);
  });
});
