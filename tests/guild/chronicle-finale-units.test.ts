import { afterAll, describe, expect, it } from 'vitest';

import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';

import { testDb, sql, endTestDb } from '../db';

/**
 * finale.units 경로 실증(2026-09-18, 소규모 업데이트 8 배포 전 점검) — runConquest가 저장하는 전체 참가자 집계를
 * aggregateConquestDay가 그대로 읽는지. 배포 전 프로덕션 전투에는 units가 없고 스테이징에는 최근 전투가 없어,
 * 이 경로는 실데이터로 한 번도 돌지 않았다(배포 첫날 23시 연대기 생성이 첫 실행이 된다).
 *
 * 시나리오(DAY=2020-02-01, 격리 서버 30001): G1 소유 구역을 G2 한 명이 수비 셋(배치 둘 + 집행관)을 모두 쓰러뜨리고 점령.
 * finale.roster/events는 비워 둔다 — **units만으로** 인원·처치·생존이 나와야 한다(마지막 N라운드에 없는 사람 포함).
 */
const SV = 30001;
const DAY = '2020-02-01';
const PREV_DAY = '2020-01-31';
const ZONE = 990011;
const USER = process.env.TEST_USER_ID!;
const G1_NAME = 'ZZ_UNITS_G1';
const G2_NAME = 'ZZ_UNITS_G2';
const FAKE = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

async function cleanup(): Promise<void> {
  await testDb.execute(sql`delete from world_events where server_id = ${SV}`);
  await testDb.execute(sql`delete from guild_battle_deployments where server_id = ${SV}`);
  await testDb.execute(sql`delete from conquest_battles where server_id = ${SV}`);
  await testDb.execute(sql`delete from zones where server_id = ${SV}`);
  await testDb.execute(sql`delete from guild_audit_log where guild_id in (select id from guilds where name in (${G1_NAME}, ${G2_NAME}))`);
  await testDb.execute(sql`delete from guilds where name in (${G1_NAME}, ${G2_NAME})`);
  await testDb.execute(sql`delete from servers where id = ${SV}`);
}

afterAll(async () => {
  await cleanup();
  await endTestDb();
});

describe.skipIf(!USER)('연대기 집계 — finale.units(전체 참가자 집계) 경로', () => {
  it('units만으로 수비 인원·열세 점령·개인 처치가 집계된다', async () => {
    await cleanup();
    await testDb.execute(sql`insert into servers (id, name, status) values (${SV}, 'ZZ_UNITS', 'open') on conflict (id) do nothing`);
    await testDb.execute(sql`insert into guilds (server_id, name, leader_user_id) values (${SV}, ${G1_NAME}, ${USER}::uuid), (${SV}, ${G2_NAME}, ${USER}::uuid)`);
    const [g1] = (await testDb.execute(sql`select id::text from guilds where name = ${G1_NAME}`)) as unknown as { id: string }[];
    const [g2] = (await testDb.execute(sql`select id::text from guilds where name = ${G2_NAME}`)) as unknown as { id: string }[];
    await testDb.execute(sql`
      insert into zones (id, server_id, region, name, map_x, map_y, owner_guild_id, executor_user_id)
      values (${ZONE}, ${SV}, 'orc', '테스트-유닛', 10, 10, ${g1!.id}, null)`);
    await testDb.execute(sql`insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, published_at) values (${SV}, ${PREV_DAY}, ${ZONE}, ${g1!.id}, now())`);
    const finale = {
      roster: [],
      events: [],
      units: [
        { userId: USER, nickname: 'ZZ공격수', guildId: g2!.id, guildName: G2_NAME, role: 'attack', kills: 3, survived: true },
        { userId: FAKE(1), nickname: 'ZZ수비1', guildId: g1!.id, guildName: G1_NAME, role: 'defend', kills: 0, survived: false },
        { userId: FAKE(2), nickname: 'ZZ수비2', guildId: g1!.id, guildName: G1_NAME, role: 'defend', kills: 0, survived: false },
        { userId: FAKE(3), nickname: 'ZZ집행관', guildId: g1!.id, guildName: G1_NAME, role: 'executor', kills: 0, survived: false },
      ],
    };
    // (param::text)::jsonb — `${JSON.stringify()}::jsonb`는 문자열로 이중 인코딩된다(postgres-js jsonb 함정).
    await testDb.execute(sql`
      insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, winner_guild_name, finale, published_at)
      values (${SV}, ${DAY}, ${ZONE}, ${g2!.id}, ${G2_NAME}, (${JSON.stringify(finale)}::text)::jsonb, null)`);
    const [shape] = (await testDb.execute(sql`select jsonb_typeof(finale) as t, jsonb_array_length(finale->'units') as n from conquest_battles where server_id = ${SV} and battle_kst_day = ${DAY}`)) as unknown as { t: string; n: number }[];
    expect(shape).toEqual({ t: 'object', n: 4 });
    await testDb.execute(sql`insert into guild_battle_deployments (server_id, battle_kst_day, user_id, guild_id, zone_id, role) values (${SV}, ${DAY}, ${USER}::uuid, ${g2!.id}, ${ZONE}, 'attack')`);

    const s = await aggregateConquestDay(DAY, SV);

    expect(s.battleCount).toBe(1);
    expect(s.captures).toHaveLength(1);
    expect(s.captures[0]).toMatchObject({ zone: '테스트-유닛', winner: G2_NAME, from: G1_NAME, defenders: 3 });
    // 한 명이 셋을 뚫은 열세 점령 — 마지막 N라운드(roster)에 아무도 없어도 units로 잡혀야 한다.
    expect(s.underdogCaptures).toEqual([expect.objectContaining({ zone: '테스트-유닛', attackers: 1, defenders: 3 })]);
    const feat = s.feats.find((f) => f.nickname === 'ZZ공격수');
    expect(feat).toMatchObject({ guild: G2_NAME, kind: '처치', count: 3, fell: false });
    // 쓰러진 수비는 활약 목록에 없다.
    expect(s.feats.some((f) => f.nickname.startsWith('ZZ수비') || f.nickname === 'ZZ집행관')).toBe(false);
  }, 60_000);
});
