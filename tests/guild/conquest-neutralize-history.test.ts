import { afterAll, describe, expect, it } from 'vitest';

import { revealConquest, neutralizeAbandonedZones } from '@/lib/game/guild/conquest/run';
import { recalcTaxBonus } from '@/lib/game/guild/tax';
import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';

import { testDb, sql, endTestDb } from '../db';

/**
 * B안 방치-중립화(neutralizeAbandonedZones)가 역사(chronicle 사실표)에 반영되는지 실증.
 * 격리 서버(SV=30000)에 합성 시나리오를 만들고 aggregateConquestDay를 검사한다(LLM 미호출 — 결정론 사실표만).
 *
 * 시나리오(DAY=2020-01-01):
 *  - 알파(990001): 전날 G1이 점령 → DAY에 G2가 공격 점령(conquest_battle winner=G2). 공격 배치 있음.
 *  - 베타(990002): G1 소유, 집행관 없음, 공격·수비 배치 없음 → 방치 → 중립화 대상.
 *
 * 두 경로를 모두 검증:
 *  1) 이벤트 경로(00시 백필) — neutralizeAbandonedZones가 zone_neutralized 이벤트 생성 후 aggregate.
 *  2) 사전생성 경로(23시) — 이벤트 없이 zones에서 중립화 예정을 직접 계산(2026-07-24 누락 버그 회귀 방지).
 */
const SV = 30000; // 격리 스크래치 서버(smallint 범위·실서버 1·2와 무충돌)
const DAY = '2020-01-01';
const PREV_DAY = '2019-12-31';
const ALPHA = 990001;
const BETA = 990002;
const USER = process.env.TEST_USER_ID!;
const G1_NAME = 'ZZ_NEUTEST_G1';
const G2_NAME = 'ZZ_NEUTEST_G2';

async function cleanup(): Promise<void> {
  await testDb.execute(sql`delete from world_events where server_id = ${SV}`); // zone_neutralized 등 잔여 이벤트
  await testDb.execute(sql`delete from guild_battle_deployments where server_id = ${SV}`);
  await testDb.execute(sql`delete from conquest_battles where server_id = ${SV}`);
  await testDb.execute(sql`delete from zones where server_id = ${SV}`);
  await testDb.execute(sql`delete from guild_audit_log where guild_id in (select id from guilds where name in (${G1_NAME}, ${G2_NAME}))`);
  await testDb.execute(sql`delete from guilds where name in (${G1_NAME}, ${G2_NAME})`);
  await testDb.execute(sql`delete from servers where id = ${SV}`);
}

/** 시나리오 셋업 — cleanup 후 서버·길드·구역·전투·배치를 심고 g1/g2 id를 돌려준다. */
async function setupScenario(): Promise<{ g1: { id: string }; g2: { id: string } }> {
  if (!USER) throw new Error('TEST_USER_ID 필요(.env.local)');
  await cleanup();
  await testDb.execute(sql`insert into servers (id, name, status) values (${SV}, 'ZZ_NEUTEST', 'open') on conflict (id) do nothing`);
  await testDb.execute(sql`insert into guilds (server_id, name, leader_user_id) values (${SV}, ${G1_NAME}, ${USER}::uuid), (${SV}, ${G2_NAME}, ${USER}::uuid)`);
  const [g1] = (await testDb.execute(sql`select id::text from guilds where name = ${G1_NAME}`)) as unknown as { id: string }[];
  const [g2] = (await testDb.execute(sql`select id::text from guilds where name = ${G2_NAME}`)) as unknown as { id: string }[];
  // 구역: 알파(G1 소유, 곧 G2에 탈취), 베타(G1 소유·집행관0·배치0 → 방치)
  await testDb.execute(sql`
    insert into zones (id, server_id, region, name, map_x, map_y, owner_guild_id)
    values (${ALPHA}, ${SV}, 'orc', '테스트-알파', 10, 10, ${g1!.id}),
           (${BETA},  ${SV}, 'orc', '테스트-베타', 20, 20, ${g1!.id})`);
  // 전날 전투: 알파를 G1이 점령(prev_owner=G1 해소용) — 이미 공개됨.
  await testDb.execute(sql`insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, published_at) values (${SV}, ${PREV_DAY}, ${ALPHA}, ${g1!.id}, now())`);
  // DAY 전투: 알파를 G2가 점령(미공개 — reveal 대상).
  await testDb.execute(sql`insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, published_at) values (${SV}, ${DAY}, ${ALPHA}, ${g2!.id}, null)`);
  // 공격 배치: G2가 알파 공격(→ 알파는 배치가 있어 중립화 제외 + attacks 반영).
  await testDb.execute(sql`insert into guild_battle_deployments (server_id, battle_kst_day, user_id, guild_id, zone_id, role) values (${SV}, ${DAY}, ${USER}::uuid, ${g2!.id}, ${ALPHA}, 'attack')`);
  return { g1: g1!, g2: g2! };
}

afterAll(async () => {
  await cleanup();
  await endTestDb();
});

describe('방치-중립화의 역사 반영(B안)', () => {
  it('[이벤트 경로] 중립화 실행 후 사실표(neutralized)에 잡힌다', async () => {
    const { g2 } = await setupScenario();

    // ── 실제 파이프라인 (자정 cron과 동일 순서) ──
    const rev = await revealConquest(SV, DAY);
    const neu = await neutralizeAbandonedZones(SV, DAY);
    await recalcTaxBonus(SV);
    const summary = await aggregateConquestDay(DAY, SV);

    const owners = (await testDb.execute(sql`select id, owner_guild_id::text owner from zones where server_id = ${SV} order by id`)) as unknown as { id: number; owner: string | null }[];
    const alpha = owners.find((z) => z.id === ALPHA)!;
    const beta = owners.find((z) => z.id === BETA)!;

    expect(rev.revealed).toBeGreaterThanOrEqual(1);
    expect(alpha.owner).toBe(g2.id); // 알파 = G2 점령
    expect(neu.neutralized).toBe(1); // 베타 1곳 중립화
    expect(beta.owner).toBeNull(); // 베타 = 중립

    const capturedZones = summary.captures.map((c) => c.zone);
    expect(capturedZones).toContain('테스트-알파');
    expect(capturedZones).not.toContain('테스트-베타');
    expect(summary.disbands).toHaveLength(0);
    expect(summary.neutralized).toHaveLength(1);
    expect(summary.neutralized[0]!.guildName).toBe(G1_NAME);
    expect(summary.neutralized[0]!.zones).toContain('테스트-베타');
    const standingByGuild = new Map(summary.standings.map((s) => [s.guild, s.zones]));
    expect(standingByGuild.get(G1_NAME) ?? 0).toBe(0);
  });

  it('[사전생성 경로] 이벤트 없이도 중립화 예정 구역이 사실표에 잡힌다(2026-07-24 누락 버그 회귀 방지)', async () => {
    const { g1 } = await setupScenario();

    // 23시 사전생성 재현 — neutralizeAbandonedZones/reveal 미실행: zone_neutralized 이벤트 없음, 베타 여전히 G1 소유.
    const events = (await testDb.execute(sql`select 1 as x from world_events where server_id = ${SV} and type = 'zone_neutralized'`)) as unknown as unknown[];
    expect(events).toHaveLength(0); // 전제: 이벤트 아직 없음
    const [betaBefore] = (await testDb.execute(sql`select owner_guild_id::text owner from zones where id = ${BETA}`)) as unknown as { owner: string | null }[];
    expect(betaBefore!.owner).toBe(g1.id); // 베타 아직 G1 소유(중립화 전)

    const summary = await aggregateConquestDay(DAY, SV);

    // 이벤트가 없어도 zones 직접 계산(소유·집행관0·배치0)으로 방치 중립화 예정이 잡혀야 한다.
    expect(summary.neutralized).toHaveLength(1);
    expect(summary.neutralized[0]!.guildName).toBe(G1_NAME);
    expect(summary.neutralized[0]!.zones).toContain('테스트-베타');
    console.log('[검증] 이벤트 없이 사전생성 시점에도 베타 방치-중립화가 direct 계산으로 잡힘(회귀 방지)');
  });
});
