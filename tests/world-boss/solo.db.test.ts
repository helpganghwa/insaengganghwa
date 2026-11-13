import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorldBossError } from '@/lib/game/world-boss/errors';
import { runSolo } from '@/lib/game/world-boss/solo-server';
import { getSoloBossDetail } from '@/lib/game/world-boss/solo-queries';
import { settleLeftBosses } from '@/lib/game/world-boss/spawn';

import { endTestDb, sql, testDb } from '../db';

/**
 * 개인 월드보스(0253) 통합 테스트(스테이징 DB) — 테스트 계정의 거주지를 잠시 보스 구역으로 옮기고
 * 도전(무료 1판) → 남은 판 없음 → 비거주자 거절 → 정산(순위·보상·우편)을 실제 표에서 돌린다. 끝나면 되돌린다.
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
    await testDb.execute(sql`update characters set residence_zone_id=${ZONE} where user_id=${T}::uuid and server_id=${S}`);
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

  it('무료 1판 → 기록·누적, 재전송은 같은 판, 남은 판 없으면 NO_RUNS, 비거주자는 NOT_RESIDENT', async () => {
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
    expect(await code(runSolo(G, S, bossId, crypto.randomUUID()))).toBe('NOT_RESIDENT');
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
    expect(d?.me).toMatchObject({ resident: true, best: r.score, rank: 1, freeLeft: 0, retryLeft: 0 });
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
  });
});
