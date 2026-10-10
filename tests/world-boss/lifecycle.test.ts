import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WORLD_BOSS_GUILD_XP_PER_STAGE, worldBossLootFor, worldBossStageHp } from '@/lib/game/guild/balance';
import { isConquestLocked } from '@/lib/game/guild/conquest/schedule';
import { distributeGuildBoxes } from '@/lib/game/guild/distribute';
import { GuildError } from '@/lib/game/guild/errors';
import { WorldBossError } from '@/lib/game/world-boss/errors';
import { cancelJoinRequest, clearWorldBossOnExit, createParty, decideJoin, departParty, leaveParty, requestJoin, syncWorldBossOwners } from '@/lib/game/world-boss/party';
import { getWorldBossBattle, getWorldBossDetail, getWorldBossMapState, worldBossIdOfParty } from '@/lib/game/world-boss/queries';
import { activateDueBosses, ensureTodayBoss, settleLeftBosses } from '@/lib/game/world-boss/spawn';

import { endTestDb, sql, testDb } from '../db';

/**
 * 월드보스 생애 통합 테스트(스테이징 DB) — 테스트 계정(SEB)이 길드장인 길드에 중립 구역 1을 잠시 쥐여 주고
 * 예약 → 출현 → 원정대(만들기·신청·수락·나가기·출발) → 단계·전리품 → 주인 변경 → 정산을 실제 표에서 돌린다.
 * 보스 행은 먼 과거 날짜(2000-01-xx)로 만들어 실제 운영 행과 섞이지 않게 하고, 끝나면 전부 되돌린다.
 */
const T = process.env.TEST_USER_ID ?? '';
const G = '9ea03a3c-41f2-4f4b-b793-da16a14402b2'; // 규규 — 무소속 참가자
const S = 1;
const ZONE = 1;
const OTHER_GUILD = '11';

const code = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'OK'; } catch (e) { return e instanceof WorldBossError ? e.code : `THROWN:${(e as Error).message}`; }
};
const q = async <T,>(s: ReturnType<typeof sql>): Promise<T[]> => (await testDb.execute(s)) as unknown as T[];

describe.skipIf(!T)('월드보스 — 생애·원정대(DB 통합)', () => {
  let guildId = '';
  let zoneOwnerBefore: string | null = null;
  let guildBefore: { pool: string; boxes: number; level: number; xp: string } | null = null;
  let t0 = new Date();
  const bossIds: string[] = [];

  const makeBoss = async (day: string, opts: { spawnOffsetMs?: number; leaveOffsetMs?: number; status?: string; totalDamage?: number; stage?: number } = {}) => {
    const spawn = new Date(Date.now() + (opts.spawnOffsetMs ?? -60_000)).toISOString();
    const leave = new Date(Date.now() + (opts.leaveOffsetMs ?? 48 * 3_600_000)).toISOString();
    const loot = worldBossLootFor(opts.stage ?? 0);
    const [b] = await q<{ id: string }>(sql`
      insert into world_bosses (server_id, zone_id, region, kst_day, spawn_at, leave_at, status, total_damage, stage, loot_diamond, loot_boxes, spawn_owner_guild_id)
      values (${S}, ${ZONE}, 'volcano', ${day}::date, ${spawn}, ${leave}, ${opts.status ?? 'active'}, ${opts.totalDamage ?? 0}::bigint, ${opts.stage ?? 0}, ${loot.diamond}::bigint, ${loot.boxes}, ${guildId}::bigint)
      returning id::text as id`);
    bossIds.push(b!.id);
    return b!.id;
  };

  beforeAll(async () => {
    t0 = new Date();
    const [m] = await q<{ g: string }>(sql`select guild_id::text as g from guild_members where user_id=${T}::uuid and server_id=${S}`);
    expect(m, '테스트 계정이 1서버 길드에 속해 있어야 한다').toBeTruthy();
    guildId = m!.g;
    const [z] = await q<{ o: string | null }>(sql`select owner_guild_id::text as o from zones where id=${ZONE}`);
    zoneOwnerBefore = z?.o ?? null;
    const [g] = await q<{ pool: string; boxes: number; level: number; xp: string }>(sql`select tax_pool_diamond::text as pool, tax_pool_boxes as boxes, level, xp::text as xp from guilds where id=${guildId}::bigint`);
    guildBefore = g!;
    await testDb.execute(sql`update zones set owner_guild_id=${guildId}::bigint where id=${ZONE}`);
    await testDb.execute(sql`delete from world_bosses where server_id=${S} and kst_day < '2001-01-01'`); // 지난 실행 잔재
  });

  afterAll(async () => {
    for (const id of bossIds) await testDb.execute(sql`delete from world_bosses where id=${id}::bigint`);
    await testDb.execute(sql`delete from world_bosses where server_id=${S} and kst_day < '2001-01-01'`);
    await testDb.execute(sql`delete from mailbox where type='world_boss' and user_id in (${T}::uuid, ${G}::uuid) and created_at >= ${t0.toISOString()}`);
    await testDb.execute(sql`delete from world_events where server_id=${S} and type like 'world_boss_%' and created_at >= ${t0.toISOString()}`);
    await testDb.execute(sql`delete from mailbox where title='길드 전리품 분배' and created_at >= ${t0.toISOString()}`);
    await testDb.execute(sql`delete from guild_audit_log where action='loot_distribute' and created_at >= ${t0.toISOString()}`);
    await testDb.execute(sql`update zones set owner_guild_id=${zoneOwnerBefore}::bigint where id=${ZONE}`);
    if (guildBefore) await testDb.execute(sql`update guilds set tax_pool_diamond=${guildBefore.pool}::bigint, tax_pool_boxes=${guildBefore.boxes}, level=${guildBefore.level}, xp=${guildBefore.xp}::bigint where id=${guildId}::bigint`);
    await endTestDb();
  });

  it('예약: 그날 행은 하나만(두 번 불러도 같은 행), 창이 지났으면 건너뜀', async () => {
    const a = await ensureTodayBoss(S);
    const b = await ensureTodayBoss(S);
    if (a.created) {
      expect(b).toEqual({ created: false, bossId: a.bossId, skipped: 'exists' });
      const [row] = await q<{ status: string; region: string }>(sql`select status, region from world_bosses where id=${a.bossId}::bigint`);
      expect(row!.status).toBe('scheduled');
      await testDb.execute(sql`delete from world_bosses where id=${a.bossId}::bigint`);
    } else {
      expect(['exists', 'window_passed', 'no_owned_zone']).toContain(a.skipped);
      if (a.skipped === 'exists') expect(b.skipped).toBe('exists');
    }
  });

  it('출현: 출현 시각이 지난 예정 보스만 출현으로 바뀌고 월드 피드에 남는다', async () => {
    const due = await makeBoss('2000-01-01', { status: 'scheduled', spawnOffsetMs: -60_000 });
    const later = await makeBoss('2000-01-02', { status: 'scheduled', spawnOffsetMs: 3_600_000 });
    const act = await activateDueBosses(S);
    expect(act.map((a) => a.id)).toContain(due);
    expect(act.map((a) => a.id)).not.toContain(later);
    const rows = await q<{ id: string; status: string }>(sql`select id::text as id, status from world_bosses where id in (${due}::bigint, ${later}::bigint) order by id`);
    expect(rows.find((r) => r.id === due)!.status).toBe('active');
    expect(rows.find((r) => r.id === later)!.status).toBe('scheduled');
    const ev = await q<{ n: number }>(sql`select count(*)::int as n from world_events where type='world_boss_spawn' and detail->>'bossId'=${due}`);
    expect(ev[0]!.n).toBe(1);
    // 지도 상태(세계지도 마커·띠·시트 카드) — 출현한 보스만 들어오고, 예정은 빠진다.
    const map = await getWorldBossMapState(S, T);
    expect(map.active.find((b) => b.id === due)).toMatchObject({ zoneId: ZONE, region: 'volcano', stage: 0, into: 0, recruiting: 0, departed: 0, mine: 'none' });
    expect(map.active.some((b) => b.id === later)).toBe(false);
  });

  it('원정대: 점령 길드원만 만들고, 누구나 신청하고, 대장이 수락·출발하며, 보스 하나에 1인 1번', async () => {
    const boss = await makeBoss('2000-01-03');
    expect(await code(createParty({ userId: G, serverId: S, bossId: boss }))).toBe('NOT_OWNER_GUILD');
    // 소개글(0231) — 공백은 한 칸으로 정리돼 모집 카드에 실린다.
    const { partyId } = await createParty({ userId: T, serverId: S, bossId: boss, intro: '  약점  장비 맞춘 분\n환영해요  ' });
    expect(await code(createParty({ userId: T, serverId: S, bossId: boss }))).toBe('ALREADY_IN_PARTY');
    expect((await getWorldBossDetail(boss, S, G))?.parties.map((p) => p.intro)).toEqual(['약점 장비 맞춘 분 환영해요']);
    // 지도 상태 — 모집 중 원정대 1, 대장은 'recruiting', 아직 신청 안 한 사람은 'none'.
    expect((await getWorldBossMapState(S, T)).active.find((b) => b.id === boss)).toMatchObject({ recruiting: 1, departed: 0, mine: 'recruiting' });
    expect((await getWorldBossMapState(S, G)).active.find((b) => b.id === boss)?.mine).toBe('none');
    // 상세 — 대장은 내 원정대(대장)·만들기 불가, 신청 전 참가자는 참가 전.
    const dl = await getWorldBossDetail(boss, S, T);
    expect(dl?.me).toMatchObject({ state: 'member', canCreate: false, isOwnerGuild: true });
    expect(dl?.myParty).toMatchObject({ partyId, isLeader: true, status: 'recruiting' });
    expect(dl?.myParty?.members.map((m) => m.userId)).toEqual([T]);
    expect((await getWorldBossDetail(boss, S, G))?.me).toMatchObject({ state: 'none', canCreate: false, isOwnerGuild: false });
    expect(await getWorldBossDetail(boss, S + 1, T)).toBeNull(); // 다른 서버
    expect(await worldBossIdOfParty(partyId, S)).toBe(boss);

    await requestJoin({ userId: G, serverId: S, partyId });
    expect(await code(requestJoin({ userId: G, serverId: S, partyId }))).toBe('ALREADY_REQUESTED');
    // 대장 화면 — 대기 중 신청이 보인다. 신청자는 'pending'.
    expect((await getWorldBossDetail(boss, S, T))?.myParty?.requests.map((r) => r.userId)).toEqual([G]);
    expect((await getWorldBossDetail(boss, S, G))?.me).toMatchObject({ state: 'pending', pendingPartyId: partyId });
    expect((await getWorldBossMapState(S, G)).active.find((b) => b.id === boss)?.mine).toBe('pending');
    expect(await code(decideJoin({ leaderUserId: G, serverId: S, partyId, userId: G, accept: true }))).toBe('NOT_LEADER');
    await decideJoin({ leaderUserId: T, serverId: S, partyId, userId: G, accept: true });
    expect((await q<{ n: number }>(sql`select count(*)::int as n from world_boss_party_members where party_id=${partyId}::bigint`))[0]!.n).toBe(2);

    // 나갔다가 다시 신청·수락.
    expect(await leaveParty({ userId: G, serverId: S, partyId })).toEqual({ disbanded: false });
    await requestJoin({ userId: G, serverId: S, partyId });
    await decideJoin({ leaderUserId: T, serverId: S, partyId, userId: G, accept: true });

    expect(await code(departParty({ leaderUserId: G, serverId: S, partyId, departKey: crypto.randomUUID() }))).toBe('NOT_LEADER');
    const key = crypto.randomUUID();
    if (isConquestLocked()) {
      expect(await code(departParty({ leaderUserId: T, serverId: S, partyId, departKey: key }))).toBe('LOCKED');
      // 23~01시(KST)에는 출발 자체를 막는다 — 나머지는 창 밖에서 확인. 모집 중 원정대를 남기면 뒤의 '주인 변경' 집계(해산 1건)가 2가 되므로 접고 나간다.
      expect(await leaveParty({ userId: T, serverId: S, partyId })).toEqual({ disbanded: true });
      return;
    }
    const r = await departParty({ leaderUserId: T, serverId: S, partyId, departKey: key });
    expect(r.duplicate).toBe(false);
    expect(r.rounds).toBe(2); // 2명 → 2라운드
    expect(r.damage).toBeGreaterThan(0);
    expect(r.stageFrom).toBe(0);
    // 보상 = 공격마다 뽑은 것의 합(복권) — finale.drops 합과 같다.
    const dropSum = (r.finale!.drops ?? []).reduce((s, [d, b]) => ({ diamond: s.diamond + d, boxes: s.boxes + b }), { diamond: 0, boxes: 0 });
    expect(r.reward).toEqual(dropSum);
    expect(r.finale?.roster.map((x) => x.userId)).toEqual([T, G]);
    // 참가자 행·보스 누적 피해·우편.
    const mem = await q<{ user_id: string; attacks: number; damage: string; fell_round: number | null }>(sql`select user_id::text as user_id, attacks, damage::text as damage, fell_round from world_boss_party_members where party_id=${partyId}::bigint order by joined_at`);
    expect(mem.reduce((a, m) => a + m.attacks, 0)).toBe(3);
    expect(mem.reduce((a, m) => a + Number(m.damage), 0)).toBe(r.damage);
    expect(mem.map((m) => m.fell_round).sort()).toEqual([1, 2]);
    const [b] = await q<{ t: string }>(sql`select total_damage::text as t from world_bosses where id=${boss}::bigint`);
    expect(Number(b!.t)).toBe(r.damage);
    const mails = await q<{ user_id: string; payload: { diamond: number; boxes: Record<string, number> } }>(sql`select user_id::text as user_id, payload from mailbox where type='world_boss' and title='월드보스 원정 보상' and user_id in (${T}::uuid, ${G}::uuid) and created_at >= ${t0.toISOString()}`);
    // 원정대원마다 자기 공격에서 뽑은 만큼(꽝뿐이면 우편 없음).
    const perUser = new Map<string, { diamond: number; boxes: number }>();
    r.finale!.events.forEach(([a], k) => {
      if (a < 0) return;
      const uid = r.finale!.roster[a]!.userId;
      const [d, b] = r.finale!.drops![k]!;
      const s = perUser.get(uid) ?? { diamond: 0, boxes: 0 };
      perUser.set(uid, { diamond: s.diamond + d, boxes: s.boxes + b });
    });
    const expectMail = [...perUser].filter(([, v]) => v.diamond > 0 || v.boxes > 0);
    expect(mails).toHaveLength(expectMail.length);
    for (const m of mails) {
      const want = perUser.get(m.user_id)!;
      expect(m.payload.diamond).toBe(want.diamond);
      expect(Object.values(m.payload.boxes).reduce((a, v) => a + v, 0)).toBe(want.boxes);
    }
    // 같은 키 재전송 = 같은 결과, 다른 키 = 이미 출발, 1인 1번.
    const again = await departParty({ leaderUserId: T, serverId: S, partyId, departKey: key });
    expect(again).toMatchObject({ duplicate: true, damage: r.damage, rounds: r.rounds, reward: r.reward });
    expect(await code(departParty({ leaderUserId: T, serverId: S, partyId, departKey: crypto.randomUUID() }))).toBe('PARTY_NOT_RECRUITING');
    expect(await code(createParty({ userId: T, serverId: S, bossId: boss }))).toBe('ALREADY_FOUGHT');
    const [bt] = await q<{ t: string }>(sql`select total_damage::text as t from world_bosses where id=${boss}::bigint`);
    expect(Number(bt!.t)).toBe(r.damage); // 재전송으로 피해가 두 번 더해지지 않는다
    // 지도 상태 — 출발한 원정대 1, 둘 다 'fought', 누적 피해·단계 진행이 같이 내려온다.
    const after = (await getWorldBossMapState(S, G)).active.find((b) => b.id === boss);
    expect(after).toMatchObject({ recruiting: 0, departed: 1, mine: 'fought', totalDamage: String(r.damage) });
    expect(after!.into + after!.stage).toBeGreaterThan(0);
    // 전투 기록(재생용) — 출발 결과와 같은 기록, 다른 서버에선 없음.
    const battle = await getWorldBossBattle(partyId, S);
    expect(battle).toMatchObject({ partyId, stageFrom: r.stageFrom, stageTo: r.stageTo, reward: r.reward });
    expect(battle!.finale.totalDamage).toBe(r.damage);
    expect(battle!.finale.roster.map((x) => x.userId)).toEqual([T, G]);
    expect(await getWorldBossBattle(partyId, S + 1)).toBeNull();
  }, 20_000); // 원격 스테이징 DB에 왕복이 많다(원정대 흐름 + 지도 상태 조회 3회)

  it('단계: 출발 피해로 단계를 넘기면 보스 단계·전리품이 절대값으로 갱신된다', async () => {
    if (isConquestLocked()) return;
    const boss = await makeBoss('2000-01-04', { totalDamage: worldBossStageHp(1) - 1, stage: 0 });
    const { partyId } = await createParty({ userId: T, serverId: S, bossId: boss });
    const r = await departParty({ leaderUserId: T, serverId: S, partyId, departKey: crypto.randomUUID() });
    expect(r.stageFrom).toBe(0);
    expect(r.stageTo).toBeGreaterThanOrEqual(1);
    const [b] = await q<{ stage: number; d: string; bx: number }>(sql`select stage, loot_diamond::text as d, loot_boxes as bx from world_bosses where id=${boss}::bigint`);
    expect(b!.stage).toBe(r.stageTo);
    expect({ diamond: Number(b!.d), boxes: b!.bx }).toEqual(worldBossLootFor(r.stageTo));
  });

  it('신청: 같은 보스에는 대기 중 신청 하나만 — 취소하면 다른 원정대에 신청할 수 있다', async () => {
    const boss = await makeBoss('2000-01-08');
    const { partyId: p1 } = await createParty({ userId: T, serverId: S, bossId: boss });
    // 두 번째 모집 중 원정대(참가자 행 없이 직접 — 주인 길드원이 테스트 계정 하나뿐이라).
    const [p2] = await q<{ id: string }>(sql`insert into world_boss_parties (boss_id, server_id, leader_user_id, guild_id) values (${boss}::bigint, ${S}, ${T}::uuid, ${guildId}::bigint) returning id::text as id`);
    await requestJoin({ userId: G, serverId: S, partyId: p1 });
    expect(await code(requestJoin({ userId: G, serverId: S, partyId: p2!.id }))).toBe('ALREADY_REQUESTED');
    await cancelJoinRequest({ userId: G, partyId: p1 });
    expect(await code(requestJoin({ userId: G, serverId: S, partyId: p2!.id }))).toBe('OK');
    // 모집 중 원정대를 남기면 뒤의 '주인 변경' 해산 집계가 어긋난다 — 보스째 지운다(원정대·신청은 cascade).
    await testDb.execute(sql`delete from world_bosses where id=${boss}::bigint`);
  }, 20_000);

  it('주인 변경: 구역을 빼앗기면 이전 주인의 모집 중 원정대는 해산되고 참가자는 다시 참가할 수 있다', async () => {
    const boss = await makeBoss('2000-01-05');
    const { partyId } = await createParty({ userId: T, serverId: S, bossId: boss });
    await requestJoin({ userId: G, serverId: S, partyId });
    await decideJoin({ leaderUserId: T, serverId: S, partyId, userId: G, accept: true });
    await testDb.execute(sql`update zones set owner_guild_id=${OTHER_GUILD}::bigint where id=${ZONE}`);
    try {
      expect(await syncWorldBossOwners(S)).toBe(1);
      const [p] = await q<{ status: string; reason: string }>(sql`select status, disband_reason as reason from world_boss_parties where id=${partyId}::bigint`);
      expect(p).toEqual({ status: 'disbanded', reason: 'owner_changed' });
      expect((await q<{ n: number }>(sql`select count(*)::int as n from world_boss_party_members where boss_id=${boss}::bigint`))[0]!.n).toBe(0);
      expect(await code(createParty({ userId: T, serverId: S, bossId: boss }))).toBe('NOT_OWNER_GUILD');
    } finally {
      await testDb.execute(sql`update zones set owner_guild_id=${guildId}::bigint where id=${ZONE}`);
    }
    // 되찾으면 다시 만들 수 있고, 대장 이탈 훅은 모집 중 원정대를 해산한다.
    const again = await createParty({ userId: T, serverId: S, bossId: boss });
    await testDb.transaction((tx) => clearWorldBossOnExit(tx as never, T, S));
    const [p2] = await q<{ status: string; reason: string }>(sql`select status, disband_reason as reason from world_boss_parties where id=${again.partyId}::bigint`);
    expect(p2).toEqual({ status: 'disbanded', reason: 'leader_left' });
  });

  it('정산: 떠나는 시각이 지나면 그 순간의 주인 길드 금고에 전리품·경험치가 들어가고 미출발 원정대는 해산된다', async () => {
    const stage = 2;
    const boss = await makeBoss('2000-01-06', { leaveOffsetMs: -1000, stage, totalDamage: worldBossStageHp(1) + worldBossStageHp(2) });
    // 떠나기 직전 만든 모집 중 원정대(lockActiveBoss는 leave_at이 지나 막히므로 직접 넣는다).
    await testDb.execute(sql`insert into world_boss_parties (boss_id, server_id, leader_user_id, guild_id) values (${boss}::bigint, ${S}, ${T}::uuid, ${guildId}::bigint)`);
    const before = (await q<{ pool: string; boxes: number; level: number; xp: string }>(sql`select tax_pool_diamond::text as pool, tax_pool_boxes as boxes, level, xp::text as xp from guilds where id=${guildId}::bigint`))[0]!;
    const settled = await settleLeftBosses(S);
    const mine = settled.find((s) => s.id === boss);
    expect(mine).toMatchObject({ guildId, stage, lootDiamond: worldBossLootFor(stage).diamond, lootBoxes: worldBossLootFor(stage).boxes, disbanded: 1 });
    const after = (await q<{ pool: string; boxes: number; level: number; xp: string }>(sql`select tax_pool_diamond::text as pool, tax_pool_boxes as boxes, level, xp::text as xp from guilds where id=${guildId}::bigint`))[0]!;
    const loot = worldBossLootFor(stage);
    expect(Number(after.pool) - Number(before.pool)).toBe(loot.diamond);
    expect(after.boxes - before.boxes).toBe(loot.boxes);
    // 경험치: 레벨업 임계를 넘지 않았다면 그대로 더해진다(넘으면 레벨이 오른다).
    const gained = BigInt(after.xp) - BigInt(before.xp);
    expect(after.level > before.level || gained === BigInt(stage * WORLD_BOSS_GUILD_XP_PER_STAGE)).toBe(true);
    const [b] = await q<{ status: string; sg: string | null }>(sql`select status, settled_guild_id::text as sg from world_bosses where id=${boss}::bigint`);
    expect(b).toEqual({ status: 'left', sg: guildId });
    const mail = await q<{ n: number }>(sql`select count(*)::int as n from mailbox where type='world_boss' and title='월드보스 전리품' and user_id=${T}::uuid and created_at >= ${t0.toISOString()}`);
    expect(mail[0]!.n).toBe(1);
    expect(await settleLeftBosses(S)).toEqual([]); // 두 번 돌려도 다시 정산하지 않는다
    expect(await code(createParty({ userId: T, serverId: S, bossId: boss }))).toBe('BOSS_NOT_ACTIVE');
    // 지도 상태 — 떠난 보스는 active에서 빠지고 48시간 기록(구역당 가장 최근 하나)에 주인 길드·전리품이 남는다.
    const map = await getWorldBossMapState(S, T);
    expect(map.active.some((b) => b.id === boss)).toBe(false);
    const [gname] = await q<{ name: string }>(sql`select name from guilds where id=${guildId}::bigint`);
    expect(map.left.find((l) => l.zoneId === ZONE)).toMatchObject({ bossId: boss, settledGuildName: gname!.name, lootDiamond: loot.diamond, lootBoxes: loot.boxes });
  });

  it('금고 상자 분배: 똑같이(3의 배수·남는 상자는 금고에) / 한 사람에게 / 부족하면 거절', async () => {
    const [{ n }] = await q<{ n: number }>(sql`select count(*)::int as n from guild_members where guild_id=${guildId}::bigint`);
    await testDb.execute(sql`update guilds set tax_pool_boxes=${3 * n * 2 + 2} where id=${guildId}::bigint`);
    const eq = await distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'equal' });
    expect(eq).toEqual({ total: 6 * n, perMember: 6, recipients: n });
    const pool = async () => (await q<{ b: number }>(sql`select tax_pool_boxes as b from guilds where id=${guildId}::bigint`))[0]!.b;
    expect(await pool()).toBe(2);
    const [mail] = await q<{ payload: { boxes: Record<string, number> } }>(sql`select payload from mailbox where user_id=${T}::uuid and title='길드 전리품 분배' and created_at >= ${t0.toISOString()} order by id desc limit 1`);
    expect(mail!.payload.boxes).toEqual({ weapon: 2, armor: 2, accessory: 2 });
    // 2개 남음 → 똑같이·한 사람 모두 3개 단위가 안 돼 거절.
    const errCode = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return e instanceof GuildError ? e.code : 'THROWN'; } };
    expect(await errCode(distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'equal' }))).toBe('NOTHING_TO_DISTRIBUTE');
    await testDb.execute(sql`update guilds set tax_pool_boxes=10 where id=${guildId}::bigint`);
    expect(await distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'target', targetUserId: T })).toEqual({ total: 9, perMember: null, recipients: 1 });
    expect(await pool()).toBe(1);
    expect(await errCode(distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'target', targetUserId: G }))).toBe('TARGET_NOT_IN_GUILD');
    // 기여 순 3개씩 — 상자 7개면 2명에게 3개씩, 1개 남음. 1개뿐이면 거절.
    await testDb.execute(sql`update guilds set tax_pool_boxes=7 where id=${guildId}::bigint`);
    expect(await distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'top' })).toEqual({ total: Math.min(2, n) * 3, perMember: 3, recipients: Math.min(2, n) });
    expect(await pool()).toBe(7 - Math.min(2, n) * 3);
    await testDb.execute(sql`update guilds set tax_pool_boxes=2 where id=${guildId}::bigint`);
    expect(await errCode(distributeGuildBoxes({ leaderUserId: T, serverId: S, mode: 'top' }))).toBe('NOTHING_TO_DISTRIBUTE');
    const [{ logs }] = await q<{ logs: number }>(sql`select count(*)::int as logs from guild_audit_log where guild_id=${guildId}::bigint and action='loot_distribute' and created_at >= ${t0.toISOString()}`);
    expect(logs).toBe(n + 1 + Math.min(2, n));
  }, 20_000);

  it('정산: 떠날 때 중립이면 전리품은 소멸한다', async () => {
    const boss = await makeBoss('2000-01-07', { leaveOffsetMs: -1000, stage: 1, totalDamage: worldBossStageHp(1) });
    await testDb.execute(sql`update zones set owner_guild_id=null where id=${ZONE}`);
    try {
      const before = (await q<{ pool: string }>(sql`select tax_pool_diamond::text as pool from guilds where id=${guildId}::bigint`))[0]!;
      const settled = await settleLeftBosses(S);
      expect(settled.find((s) => s.id === boss)).toMatchObject({ guildId: null, stage: 1 });
      const after = (await q<{ pool: string }>(sql`select tax_pool_diamond::text as pool from guilds where id=${guildId}::bigint`))[0]!;
      expect(after.pool).toBe(before.pool);
    } finally {
      await testDb.execute(sql`update zones set owner_guild_id=${guildId}::bigint where id=${ZONE}`);
    }
  });
});
