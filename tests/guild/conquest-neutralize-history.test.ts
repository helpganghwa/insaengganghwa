import { afterAll, describe, expect, it } from 'vitest';

import { revealConquest, neutralizeAbandonedZones } from '@/lib/game/guild/conquest/run';
import { recalcTaxBonus } from '@/lib/game/guild/tax';
import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';

import { testDb, sql, endTestDb } from '../db';

/**
 * B안 방치-중립화(neutralizeAbandonedZones)가 역사(chronicle 사실표)에 반영되는지 실증.
 * 격리 서버(SV=90001)에 합성 시나리오를 만들고 실제 파이프라인을 돌린 뒤 aggregateConquestDay를
 * 검사한다(LLM 미호출 — 결정론적 사실표만).
 *
 * 시나리오(DAY=2020-01-01):
 *  - 알파(990001): 전날 G1이 점령 → DAY에 G2가 공격 점령(conquest_battle winner=G2). 공격 배치 있음.
 *  - 베타(990002): G1 소유, 집행관 없음, 공격·수비 배치 없음 → 방치 → 중립화 대상.
 * 기대(수정 후): captures엔 알파, 그리고 베타의 방치-중립화가 summary.neutralized에 이전 소유
 * 길드(G1)와 함께 잡힌다 → 역사가 방치-중립화를 서술할 수 있음.
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

afterAll(async () => {
  await cleanup();
  await endTestDb();
});

describe('방치-중립화의 역사 반영(B안)', () => {
  it('중립화된 구역이 chronicle 사실표(neutralized)에 잡힌다(수정 검증)', async () => {
    if (!USER) throw new Error('TEST_USER_ID 필요(.env.local)');
    await cleanup();

    // 스크래치 서버(guilds/zones/... 의 server_id FK 대상)
    await testDb.execute(sql`insert into servers (id, name, status) values (${SV}, 'ZZ_NEUTEST', 'open') on conflict (id) do nothing`);
    // 길드 2개(leader_user_id NOT NULL — unique 제약 없어 테스트 유저 공용)
    await testDb.execute(sql`insert into guilds (server_id, name, leader_user_id) values (${SV}, ${G1_NAME}, ${USER}::uuid), (${SV}, ${G2_NAME}, ${USER}::uuid)`);
    const [g1] = (await testDb.execute(sql`select id::text from guilds where name = ${G1_NAME}`)) as unknown as { id: string }[];
    const [g2] = (await testDb.execute(sql`select id::text from guilds where name = ${G2_NAME}`)) as unknown as { id: string }[];

    // 구역: 알파(G1 소유, 곧 G2에 탈취), 베타(G1 소유·집행관0·배치0 → 방치)
    await testDb.execute(sql`
      insert into zones (id, server_id, region, name, map_x, map_y, owner_guild_id)
      values (${ALPHA}, ${SV}, 'orc', '테스트-알파', 10, 10, ${g1.id}),
             (${BETA},  ${SV}, 'orc', '테스트-베타', 20, 20, ${g1.id})`);

    // 전날 전투: 알파를 G1이 점령(prev_owner=G1 해소용) — 이미 공개됨.
    await testDb.execute(sql`
      insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, published_at)
      values (${SV}, ${PREV_DAY}, ${ALPHA}, ${g1.id}, now())`);
    // DAY 전투: 알파를 G2가 점령(미공개 — reveal 대상).
    await testDb.execute(sql`
      insert into conquest_battles (server_id, battle_kst_day, zone_id, winner_guild_id, published_at)
      values (${SV}, ${DAY}, ${ALPHA}, ${g2.id}, null)`);
    // 공격 배치: G2가 알파 공격(→ 알파는 배치가 있어 중립화 제외 + attacks 목록 반영).
    await testDb.execute(sql`
      insert into guild_battle_deployments (server_id, battle_kst_day, user_id, guild_id, zone_id, role)
      values (${SV}, ${DAY}, ${USER}::uuid, ${g2.id}, ${ALPHA}, 'attack')`);

    // ── 실제 파이프라인 (자정 cron과 동일 순서) ──
    const rev = await revealConquest(SV, DAY);
    const neu = await neutralizeAbandonedZones(SV, DAY);
    await recalcTaxBonus(SV);
    const summary = await aggregateConquestDay(DAY, SV);

    // 소유권 결과 검증
    const owners = (await testDb.execute(sql`select id, owner_guild_id::text owner from zones where server_id = ${SV} order by id`)) as unknown as { id: number; owner: string | null }[];
    const alpha = owners.find((z) => z.id === ALPHA)!;
    const beta = owners.find((z) => z.id === BETA)!;

    expect(rev.revealed).toBeGreaterThanOrEqual(1);
    expect(alpha.owner).toBe(g2.id); // 알파 = G2 점령
    expect(neu.neutralized).toBe(1); // 베타 1곳 중립화
    expect(beta.owner).toBeNull(); // 베타 = 중립

    // ── 역사(사실표) 검증 ──
    const capturedZones = summary.captures.map((c) => c.zone);
    const defenseZones = summary.defenses.map((d) => d.zone);
    const standingByGuild = new Map(summary.standings.map((s) => [s.guild, s.zones]));

    // 알파 점령은 여전히 captures로 잡힌다(전투 상실이지 방치 아님).
    expect(capturedZones).toContain('테스트-알파');
    expect(capturedZones).not.toContain('테스트-베타'); // 베타는 점령이 아님
    expect(defenseZones).not.toContain('테스트-베타');
    expect(summary.disbands).toHaveLength(0); // 해산도 아님

    // 수정 검증: 베타 방치-중립화가 neutralized에 이전 소유 길드(G1)와 함께 잡힌다.
    expect(summary.neutralized).toHaveLength(1);
    expect(summary.neutralized[0]!.guildName).toBe(G1_NAME);
    expect(summary.neutralized[0]!.zones).toContain('테스트-베타');
    // standings: G1은 알파 상실 + 베타 중립화로 0곳(정상) — 이제 neutralized 이벤트가 상실을 설명한다.
    expect(standingByGuild.get(G1_NAME) ?? 0).toBe(0);

    console.log('[검증] captures:', JSON.stringify(summary.captures));
    console.log('[검증] neutralized:', JSON.stringify(summary.neutralized));
    console.log('[검증] standings:', JSON.stringify(summary.standings));
    console.log('[검증] 베타(990002) 방치-중립화가 이전 소유 길드 G1과 함께 사실표에 잡힘 → 역사 서술 가능(수정 확인)');
  });
});
