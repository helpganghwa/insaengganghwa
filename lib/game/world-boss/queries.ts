/**
 * 월드보스 읽기 질의 — 세계지도(마커·띠·구역 시트 카드)와 /world-boss 화면이 쓴다. 쓰기는 party.ts·spawn.ts.
 * 서버 전용(DB). 클라에 내려 주는 모양은 map-types.ts.
 */
import 'server-only';

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profilesByIds } from '@/lib/game/friends';
import { guilds } from '@/lib/db/schema/guild';
import { worldBossParties, worldBossPartyMembers, worldBosses } from '@/lib/db/schema/world-boss';
import { WORLD_BOSS_LEFT_NOTE_MS, WORLD_BOSS_WEAK_PER_SLOT, worldBossStageFor } from '@/lib/game/guild/balance';

import { worldBossName } from './bosses';
import { bestLoadoutOf, currentPhase, knownWeakOf, loadoutsOf } from './loadout';
import type { WorldBossMapBoss, WorldBossMapLeft, WorldBossMapState, WorldBossMine } from './map-types';
import type { WorldBossDetail, WorldBossMe, WorldBossMyParty, WorldBossPartyCard, WorldBossPerson } from './view-types';

/**
 * 지도 상태 — 머무는 보스 전부(출현 순) + 떠난 지 48시간 안인 보스(구역당 가장 최근 하나).
 * userId가 있으면 보스마다 내 상태(모집 중 원정대 소속 / 출발 완료)를 함께 준다.
 */
export async function getWorldBossMapState(serverId: number, userId: string | null, now = new Date()): Promise<WorldBossMapState> {
  const rows = await db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      spawnAt: worldBosses.spawnAt,
      leaveAt: worldBosses.leaveAt,
      totalDamage: worldBosses.totalDamage,
      stage: worldBosses.stage,
      lootDiamond: worldBosses.lootDiamond,
      lootBoxes: worldBosses.lootBoxes,
    })
    .from(worldBosses)
    .where(and(eq(worldBosses.serverId, serverId), eq(worldBosses.status, 'active')))
    .orderBy(worldBosses.spawnAt);

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { recruiting: number; departed: number }>();
  const mine = new Map<string, WorldBossMine>();
  if (ids.length > 0) {
    const c = await db
      .select({ bossId: worldBossParties.bossId, status: worldBossParties.status, n: sql<number>`count(*)::int` })
      .from(worldBossParties)
      .where(inArray(worldBossParties.bossId, ids))
      .groupBy(worldBossParties.bossId, worldBossParties.status);
    for (const r of c) {
      const k = r.bossId.toString();
      const cur = counts.get(k) ?? { recruiting: 0, departed: 0 };
      if (r.status === 'recruiting') cur.recruiting += r.n;
      else if (r.status === 'departed') cur.departed += r.n;
      counts.set(k, cur);
    }
    if (userId) {
      // 해산된 원정대의 참가 행은 지워지므로(party.ts) 남은 행은 모집 중이거나 출발한 것뿐이다.
      const m = await db
        .select({ bossId: worldBossPartyMembers.bossId, status: worldBossParties.status })
        .from(worldBossPartyMembers)
        .innerJoin(worldBossParties, eq(worldBossParties.id, worldBossPartyMembers.partyId))
        .where(and(eq(worldBossPartyMembers.userId, userId), inArray(worldBossPartyMembers.bossId, ids)));
      for (const r of m) mine.set(r.bossId.toString(), r.status === 'departed' ? 'fought' : 'recruiting');
      // 신청 대기(소속이 없을 때만) — 시트 안내 문구 분기용.
      const pend = (await db.execute(sql`
        select distinct p.boss_id::text as b from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
         where r.user_id = ${userId}::uuid and r.status = 'pending' and p.status = 'recruiting' and p.boss_id = any(${`{${ids.join(',')}}`}::bigint[])`)) as unknown as { b: string }[];
      for (const r of pend) if (!mine.has(r.b)) mine.set(r.b, 'pending');
    }
  }

  const active: WorldBossMapBoss[] = rows.map((r) => {
    const id = r.id.toString();
    const total = Number(r.totalDamage);
    const st = worldBossStageFor(total);
    const c = counts.get(id) ?? { recruiting: 0, departed: 0 };
    return {
      id,
      zoneId: r.zoneId,
      region: r.region,
      name: worldBossName(r.region),
      spawnAt: r.spawnAt.getTime(),
      leaveAt: r.leaveAt.getTime(),
      totalDamage: r.totalDamage.toString(),
      stage: r.stage,
      into: st.into,
      need: st.need,
      lootDiamond: Number(r.lootDiamond),
      lootBoxes: r.lootBoxes,
      recruiting: c.recruiting,
      departed: c.departed,
      mine: mine.get(id) ?? 'none',
    };
  });

  const since = new Date(now.getTime() - WORLD_BOSS_LEFT_NOTE_MS);
  const leftRows = await db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      leaveAt: worldBosses.leaveAt,
      stage: worldBosses.stage,
      lootDiamond: worldBosses.lootDiamond,
      lootBoxes: worldBosses.lootBoxes,
      settledGuildName: guilds.name,
    })
    .from(worldBosses)
    .leftJoin(guilds, eq(guilds.id, worldBosses.settledGuildId))
    .where(and(eq(worldBosses.serverId, serverId), eq(worldBosses.status, 'left'), gt(worldBosses.leaveAt, since)))
    .orderBy(desc(worldBosses.leaveAt));
  const seen = new Set<number>();
  const left: WorldBossMapLeft[] = [];
  for (const r of leftRows) {
    if (seen.has(r.zoneId)) continue; // 구역당 가장 최근 하나
    seen.add(r.zoneId);
    left.push({
      bossId: r.id.toString(),
      zoneId: r.zoneId,
      region: r.region,
      name: worldBossName(r.region),
      leftAt: r.leaveAt.getTime(),
      stage: r.stage,
      settledGuildName: r.settledGuildName ?? null,
      lootDiamond: Number(r.lootDiamond),
      lootBoxes: r.lootBoxes,
    });
  }
  return { active, left };
}

// ── 보스 상세(/world-boss/<id>) ──────────────────────────────────────────────


/** 사람들(원정대원·신청자) — 닉네임·공개 코드·길드·월드보스 전투력(장착 3개 + 보너스). 한 화면에 20명 남짓이라 즉석 계산. */
async function peopleOn(serverId: number, userIds: string[], known: ReadonlySet<string>): Promise<Map<string, WorldBossPerson>> {
  const out = new Map<string, WorldBossPerson>();
  if (userIds.length === 0) return out;
  const ids = [...new Set(userIds)];
  const [rows, lo] = await Promise.all([
    db.execute(sql`
      select c.user_id::text as uid, c.nickname, p.public_code as code, g.name as gname
        from characters c
        join profiles p on p.id = c.user_id
        left join guild_members gm on gm.user_id = c.user_id and gm.server_id = c.server_id
        left join guilds g on g.id = gm.guild_id
       where c.server_id = ${serverId} and c.user_id = any(${`{${ids.join(',')}}`}::uuid[])`) as unknown as Promise<{ uid: string; nickname: string; code: string | null; gname: string | null }[]>,
    loadoutsOf(serverId, ids, known),
  ]);
  const faces = new Map((await profilesByIds(ids, serverId).catch(() => [])).map((f) => [f.userId, f] as const));
  for (const r of rows) {
    const f = faces.get(r.uid);
    const l = lo.get(r.uid);
    out.set(r.uid, {
      userId: r.uid, nickname: r.nickname, code: r.code, guildName: r.gname,
      combat: l?.power ?? 0, weakCount: l?.weakCount ?? 0, avatarCount: l?.avatarCount ?? 0,
      avatarSrc: f?.profileSouth ?? null, faceBox: f?.faceBox ?? null,
    });
  }
  return out;
}

/** 보스 상세 — 없거나 다른 서버면 null. 해산된 원정대는 보이지 않는다(모집 중·출발만). */
export async function getWorldBossDetail(bossId: string, serverId: number, userId: string | null): Promise<WorldBossDetail | null> {
  if (!/^\d+$/.test(bossId)) return null;
  const [b] = (await db.execute(sql`
    select b.id::text as id, b.server_id, b.zone_id, z.name as zone_name, b.region, b.status, b.spawn_at, b.leave_at,
           b.total_damage::text as total, b.stage, b.loot_diamond::text as ld, b.loot_boxes,
           z.owner_guild_id::text as owner_id, og.name as owner_name, sg.name as settled_name
      from world_bosses b join zones z on z.id = b.zone_id
      left join guilds og on og.id = z.owner_guild_id
      left join guilds sg on sg.id = b.settled_guild_id
     where b.id = ${bossId}::bigint`)) as unknown as {
    id: string; server_id: number; zone_id: number; zone_name: string; region: string; status: 'scheduled' | 'active' | 'left';
    spawn_at: Date | string; leave_at: Date | string; total: string; stage: number; ld: string; loot_boxes: number;
    owner_id: string | null; owner_name: string | null; settled_name: string | null;
  }[];
  if (!b || b.server_id !== serverId || b.status === 'scheduled') return null;

  const partyRows = (await db.execute(sql`
    select p.id::text as id, p.status, p.leader_user_id::text as leader, c.nickname as leader_nick, g.name as gname, p.intro, p.created_at, p.departed_at,
           p.damage::text as damage, p.rounds, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes,
           (select count(*)::int from world_boss_party_members m where m.party_id = p.id) as n
      from world_boss_parties p
      left join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
      left join guilds g on g.id = p.guild_id
     where p.boss_id = ${bossId}::bigint and p.status in ('recruiting', 'departed')
     order by p.created_at`)) as unknown as {
    id: string; status: 'recruiting' | 'departed'; leader: string; leader_nick: string | null; gname: string | null; intro: string | null; created_at: Date | string; departed_at: Date | string | null;
    damage: string; rounds: number; stage_from: number | null; stage_to: number | null; reward_diamond: number; reward_boxes: number; n: number;
  }[];
  const ms = (v: Date | string | null) => (v == null ? null : new Date(v).getTime());

  let me: WorldBossMe | null = null;
  let myParty: WorldBossMyParty | null = null;
  let mine: WorldBossDetail['mine'] = null;
  const active = b.status === 'active' && new Date(b.leave_at).getTime() > Date.now();
  const phase = currentPhase(b.stage);
  const weakKnown = await knownWeakOf(b.id, phase.index);
  const known = new Set(weakKnown.map((w) => w.code));

  // 모집 중 원정대 명단(10-10 사용자: 목록에서 누가 있는지·합산 전투력이 보이게) — 전투력은 공개된 약점 기준이라 known 뒤에 센다.
  // 완료된 원정대는 명단을 싣지 않는다(지금 전투력은 그 전투와 무관, 전투 보기가 있다).
  const recruitingIds = partyRows.filter((p) => p.status === 'recruiting').map((p) => p.id);
  const roster =
    recruitingIds.length > 0
      ? ((await db.execute(sql`
          select party_id::text as pid, user_id::text as uid from world_boss_party_members
           where party_id = any(${`{${recruitingIds.join(',')}}`}::bigint[]) order by joined_at, user_id`)) as unknown as { pid: string; uid: string }[])
      : [];
  const rosterPeople = await peopleOn(serverId, roster.map((r) => r.uid), known);
  const membersOf = (p: { id: string; leader: string }) =>
    roster
      .filter((r) => r.pid === p.id)
      .map((r) => {
        const x = rosterPeople.get(r.uid);
        return { userId: r.uid, nickname: x?.nickname ?? '알 수 없음', combat: x?.combat ?? 0, isLeader: r.uid === p.leader };
      })
      .sort((x, y) => Number(y.isLeader) - Number(x.isLeader)); // 대장 먼저(안정 정렬이라 나머지는 참가 순 유지)
  const parties: WorldBossPartyCard[] = partyRows.map((p) => {
    const members = membersOf(p);
    return {
      id: p.id, status: p.status, leaderNickname: p.leader_nick ?? '알 수 없음', guildName: p.gname, intro: p.intro,
      members, combatSum: members.reduce((s, m) => s + m.combat, 0), memberCount: p.n,
      createdAt: ms(p.created_at)!, departedAt: ms(p.departed_at), damage: Number(p.damage), rounds: p.rounds,
      stageFrom: p.stage_from, stageTo: p.stage_to, rewardDiamond: p.reward_diamond, rewardBoxes: p.reward_boxes,
    };
  });
  if (userId) {
    const [[mem], [req], [gm]] = await Promise.all([
      db.execute(sql`select m.party_id::text as pid, p.status, p.leader_user_id::text as leader from world_boss_party_members m join world_boss_parties p on p.id = m.party_id
                      where m.boss_id = ${bossId}::bigint and m.user_id = ${userId}::uuid limit 1`) as unknown as Promise<{ pid: string; status: 'recruiting' | 'departed'; leader: string }[]>,
      db.execute(sql`select r.party_id::text as pid from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
                      where p.boss_id = ${bossId}::bigint and r.user_id = ${userId}::uuid and r.status = 'pending' and p.status = 'recruiting' limit 1`) as unknown as Promise<{ pid: string }[]>,
      db.execute(sql`select guild_id::text as g from guild_members where user_id = ${userId}::uuid and server_id = ${serverId}`) as unknown as Promise<{ g: string }[]>,
    ]);
    const isOwnerGuild = gm != null && b.owner_id != null && gm.g === b.owner_id;
    const state: WorldBossMe['state'] = mem ? (mem.status === 'departed' ? 'fought' : 'member') : req ? 'pending' : 'none';
    me = { userId, state, pendingPartyId: req?.pid ?? null, canCreate: active && isOwnerGuild && state === 'none', isOwnerGuild };
    if (mem) {
      const isLeader = mem.leader === userId;
      const [memIds, reqIds] = await Promise.all([
        db.execute(sql`select user_id::text as uid from world_boss_party_members where party_id = ${mem.pid}::bigint order by joined_at, user_id`) as unknown as Promise<{ uid: string }[]>,
        isLeader && mem.status === 'recruiting'
          ? (db.execute(sql`select user_id::text as uid from world_boss_join_requests where party_id = ${mem.pid}::bigint and status = 'pending' order by created_at`) as unknown as Promise<{ uid: string }[]>)
          : Promise.resolve([] as { uid: string }[]),
      ]);
      const people = await peopleOn(serverId, [...memIds.map((r) => r.uid), ...reqIds.map((r) => r.uid)], known);
      const person = (uid: string): WorldBossPerson => people.get(uid) ?? { userId: uid, nickname: '알 수 없음', code: null, guildName: null, combat: 0, weakCount: 0, avatarCount: 0, avatarSrc: null, faceBox: null };
      myParty = {
        partyId: mem.pid, status: mem.status, isLeader, leaderUserId: mem.leader,
        members: memIds.map((r) => ({ ...person(r.uid), isLeader: r.uid === mem.leader })),
        requests: reqIds.map((r) => person(r.uid)),
      };
    }
    // 내 장착 상태 — 이미 싸웠으면 바꿔도 의미가 없어 보이지 않는다.
    if (active && state !== 'fought') {
      const [lo, best] = await Promise.all([loadoutsOf(serverId, [userId], known), bestLoadoutOf(serverId, userId, known)]);
      const l = lo.get(userId);
      if (l) mine = { loadout: l, best: best && best.power > l.power ? { power: best.power, pieces: best.pieces } : null };
    }
  }

  const total = Number(b.total);
  const st = worldBossStageFor(total);
  return {
    id: b.id, serverId: b.server_id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, name: worldBossName(b.region),
    status: active ? 'active' : 'left', spawnAt: ms(b.spawn_at)!, leaveAt: ms(b.leave_at)!, totalDamage: total,
    stage: b.stage, into: st.into, need: st.need, lootDiamond: Number(b.ld), lootBoxes: b.loot_boxes,
    ownerGuildName: b.owner_name, settledGuildName: b.settled_name, parties, me, myParty,
    phase, weakKnown, weakTotal: WORLD_BOSS_WEAK_PER_SLOT * 3, mine,
  };
}

/** 원정대 id → 보스 id(푸시 딥링크 /world-boss/party/<id> 변환용). */
export async function worldBossIdOfParty(partyId: string, serverId: number): Promise<string | null> {
  if (!/^\d+$/.test(partyId)) return null;
  const [r] = (await db.execute(sql`select boss_id::text as b from world_boss_parties where id = ${partyId}::bigint and server_id = ${serverId}`)) as unknown as { b: string }[];
  return r?.b ?? null;
}

/** 출발한 원정대의 전투 기록(재생용). 다른 서버·미출발·기록 없음이면 null. */
export async function getWorldBossBattle(partyId: string, serverId: number): Promise<import('./view-types').WorldBossBattle | null> {
  if (!/^\d+$/.test(partyId)) return null;
  const [r] = (await db.execute(sql`
    select p.id::text as id, p.finale, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes, c.nickname as leader
      from world_boss_parties p left join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
     where p.id = ${partyId}::bigint and p.server_id = ${serverId} and p.status = 'departed'`)) as unknown as {
    id: string; finale: import('./view-types').WorldBossBattle['finale'] | null; stage_from: number | null; stage_to: number | null;
    reward_diamond: number; reward_boxes: number; leader: string | null;
  }[];
  if (!r?.finale) return null;
  const faces = await profilesByIds(r.finale.roster.map((m) => m.userId), serverId).catch(() => []);
  const avatars: import('./view-types').WorldBossBattle['avatars'] = {};
  for (const f of faces) avatars[f.userId] = { src: f.profileSouth, box: f.faceBox ?? null };
  return {
    avatars,
    partyId: r.id,
    leaderNickname: r.leader ?? '알 수 없음',
    finale: r.finale,
    stageFrom: r.stage_from ?? 0,
    stageTo: r.stage_to ?? 0,
    reward: { diamond: r.reward_diamond, boxes: r.reward_boxes },
  };
}

/**
 * 그날 점령전 공개(자정) 때 보스가 머물던 구역 — 연대기 사실표용. 출현이 그날 23시(전투 마감) 이전이고 떠남이 다음 날 0시 이후.
 * 상태가 아니라 시각으로 고른다 — 연대기를 나중에 다시 만들어도 같은 구역이 잡히게. 단계·전리품은 지금 값(사전 생성 23시 기준이면 그 시각 값).
 */
export async function worldBossesAtConquestReveal(serverId: number, kstDay: string): Promise<import('./chronicle-facts').WorldBossAtZone[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kstDay)) return [];
  const rows = (await db.execute(sql`
    select z.name as zone, b.region, b.stage, b.loot_diamond::text as ld, b.loot_boxes
      from world_bosses b join zones z on z.id = b.zone_id
     where b.server_id = ${serverId} and b.status <> 'scheduled'
       and b.spawn_at <= (${kstDay}::date + time '23:00') at time zone 'Asia/Seoul'
       and b.leave_at > ((${kstDay}::date + 1)::timestamp) at time zone 'Asia/Seoul'`)) as unknown as {
    zone: string; region: string; stage: number; ld: string; loot_boxes: number;
  }[];
  return rows.map((r) => ({ zone: r.zone, name: worldBossName(r.region), stage: r.stage, lootDiamond: Number(r.ld), lootBoxes: r.loot_boxes }));
}
