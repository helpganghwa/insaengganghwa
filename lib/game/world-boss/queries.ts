/**
 * 월드보스 읽기 질의 — 세계지도(마커·띠·구역 시트 카드)와 /world-boss 화면이 쓴다. 쓰기는 party.ts·spawn.ts.
 * 서버 전용(DB). 클라에 내려 주는 모양은 map-types.ts.
 */
import 'server-only';

import { and, desc, eq, gt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getFriendIds, profilesByIds } from '@/lib/game/friends';
import { guilds } from '@/lib/db/schema/guild';
import { worldBosses } from '@/lib/db/schema/world-boss';
import { WORLD_BOSS_LEFT_NOTE_MS, WORLD_BOSS_WEAK_BONUS, parseWorldBossTraits, worldBossStageFor, worldBossTraitDef, worldBossWeakBonus, worldBossWeakPerSlot } from '@/lib/game/guild/balance';

import { worldBossName } from './bosses';
import { bestLoadoutOf, knownWeakOf, loadoutsOf, piecePower } from './loadout';
import { parseWeak } from './weak';
import type { WorldBossMapBoss, WorldBossMapLeft, WorldBossMapState } from './map-types';
import type { WorldBossDetail, WorldBossInvitable, WorldBossInviteIn, WorldBossMe, WorldBossMyParty, WorldBossPartyCard, WorldBossPerson } from './view-types';

/**
 * 지도 상태 — 머무는 보스 전부(출현 순) + 종료 뒤 24시간(WORLD_BOSS_LEFT_NOTE_MS) 안인 보스(구역당 가장 최근 하나).
 * userId가 있으면 보스마다 내 상태(모집 중 원정대 소속 / 출발 완료)를 함께 준다.
 */
export async function getWorldBossMapState(serverId: number, now = new Date()): Promise<WorldBossMapState> {
  const rowsP = db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      bossCode: worldBosses.bossCode,
      spawnAt: worldBosses.spawnAt,
      leaveAt: worldBosses.leaveAt,
      totalDamage: worldBosses.totalDamage,
      stage: worldBosses.stage,
      lootDiamond: worldBosses.lootDiamond,
      lootBoxes: worldBosses.lootBoxes,
      traits: worldBosses.traits,
    })
    .from(worldBosses)
    // 떠나는 시각이 지났으면(크론이 아직 정산 전, 최대 5분) 지도에서도 '출현 중'이 아니다 — 상세·홈 배너와 같은 기준(10-11 재검사).
    .where(and(eq(worldBosses.serverId, serverId), eq(worldBosses.status, 'active'), gt(worldBosses.leaveAt, now)))
    .orderBy(worldBosses.spawnAt);


  const since = new Date(now.getTime() - WORLD_BOSS_LEFT_NOTE_MS);
  const leftRowsP = db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      bossCode: worldBosses.bossCode,
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
  const [rows, leftRows] = await Promise.all([rowsP, leftRowsP]); // 독립 조회 둘은 같이 기다린다(10-11 3차)

  const active: WorldBossMapBoss[] = rows.map((r) => {
    return {
      id: r.id.toString(),
      zoneId: r.zoneId,
      region: r.region,
      bossCode: r.bossCode,
      name: worldBossName(r.bossCode),
      leaveAt: r.leaveAt.getTime(),
      stage: r.stage,
      lootDiamond: Number(r.lootDiamond),
      lootBoxes: r.lootBoxes,
      traits: parseWorldBossTraits(r.traits).map((c) => ({ code: c, name: worldBossTraitDef(c)!.name })),
    };
  });

  const seen = new Set<number>();
  const left: WorldBossMapLeft[] = [];
  for (const r of leftRows) {
    if (seen.has(r.zoneId)) continue; // 구역당 가장 최근 하나
    seen.add(r.zoneId);
    left.push({
      bossId: r.id.toString(),
      zoneId: r.zoneId,
      region: r.region,
      bossCode: r.bossCode,
      name: worldBossName(r.bossCode),
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


/** 이름·길드 문양만(완료 원정대 명단용) — 전투력·얼굴 없이 가볍게. */
async function namesOn(serverId: number, userIds: string[]): Promise<Map<string, { nickname: string; guildName: string | null; guildEmblemUrl: string | null; guildEmblemColor: string | null }>> {
  const out = new Map<string, { nickname: string; guildName: string | null; guildEmblemUrl: string | null; guildEmblemColor: string | null }>();
  const ids = [...new Set(userIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return out;
  const rows = (await db.execute(sql`
    select c.user_id::text as uid, c.nickname, g.name as gname, g.emblem_url as gurl, g.emblem_color as gcolor
      from characters c
      left join guild_members gm on gm.user_id = c.user_id and gm.server_id = c.server_id
      left join guilds g on g.id = gm.guild_id
     where c.server_id = ${serverId} and c.user_id = any(${`{${ids.join(',')}}`}::uuid[])`)) as unknown as { uid: string; nickname: string; gname: string | null; gurl: string | null; gcolor: string | null }[];
  for (const r of rows) out.set(r.uid, { nickname: r.nickname, guildName: r.gname, guildEmblemUrl: r.gurl, guildEmblemColor: r.gcolor });
  return out;
}

/** 사람들(원정대원·신청자) — 닉네임·공개 코드·길드·월드보스 전투력(장착 3개 + 보너스). 한 화면에 20명 남짓이라 즉석 계산. */
async function peopleOn(serverId: number, userIds: string[], known: ReadonlySet<string>, weakBonus: number = WORLD_BOSS_WEAK_BONUS): Promise<Map<string, WorldBossPerson>> {
  const out = new Map<string, WorldBossPerson>();
  if (userIds.length === 0) return out;
  const ids = [...new Set(userIds)];
  const [rows, lo, faceRows] = await Promise.all([
    db.execute(sql`
      select c.user_id::text as uid, c.nickname, p.public_code as code, g.name as gname, g.emblem_url as gurl, g.emblem_color as gcolor
        from characters c
        join profiles p on p.id = c.user_id
        left join guild_members gm on gm.user_id = c.user_id and gm.server_id = c.server_id
        left join guilds g on g.id = gm.guild_id
       where c.server_id = ${serverId} and c.user_id = any(${`{${ids.join(',')}}`}::uuid[])`) as unknown as Promise<{ uid: string; nickname: string; code: string | null; gname: string | null; gurl: string | null; gcolor: string | null }[]>,
    loadoutsOf(serverId, ids, known, weakBonus),
    profilesByIds(ids, serverId).catch(() => []), // 앞 둘과 무관 — 같이 기다린다(10-11 감사)
  ]);
  const faces = new Map(faceRows.map((f) => [f.userId, f] as const));
  for (const r of rows) {
    const f = faces.get(r.uid);
    const l = lo.get(r.uid);
    out.set(r.uid, {
      userId: r.uid, nickname: r.nickname, code: r.code, guildName: r.gname, guildEmblemUrl: r.gurl, guildEmblemColor: r.gcolor,
      combat: l?.power ?? 0, weakCount: l?.weakCount ?? 0, avatarCount: l?.avatarCount ?? 0,
      avatarSrc: f?.profileSouth ?? null, faceBox: f?.faceBox ?? null,
      // 부위 전투력 = 보너스까지 더한 값(loadout.power와 같은 식), 칸 색은 아바타(약점 장비면 유지)·약점.
      pieces: (l?.pieces ?? []).map((p) => ({ slot: p.slot, src: p.src, cp: Math.round(piecePower(p.cp, p.av, !!l?.hasAvatar, p.weak, weakBonus)), av: p.av || (!!l?.hasAvatar && p.weak), weak: p.weak })),
    });
  }
  return out;
}

/** 보스 상세 — 없거나 다른 서버면 null. 해산된 원정대는 보이지 않는다(모집 중·출발만). */
export async function getWorldBossDetail(bossId: string, serverId: number, userId: string | null): Promise<WorldBossDetail | null> {
  if (!/^\d{1,18}$/.test(bossId)) return null;
  // 1단계 — 보스 id·유저 id만으로 되는 조회는 전부 같이(10-11 3차 결정 ⑧: 6단계 21~24쿼리 → 2단계 ~16쿼리). 보스가 없거나 다른 서버면 결과는 버린다.
  const [[b], partyRows, weakKnown, mineRows] = await Promise.all([
    db.execute(sql`
    select b.id::text as id, b.server_id, b.zone_id, z.name as zone_name, b.region, b.boss_code, b.status, b.spawn_at, b.leave_at,
           b.total_damage::text as total, b.stage, b.loot_diamond::text as ld, b.loot_boxes, b.traits, b.weak,
           z.owner_guild_id::text as owner_id, og.name as owner_name, og.emblem_url as owner_emblem, og.emblem_color as owner_color,
           sg.name as settled_name, sg.emblem_url as settled_emblem, sg.emblem_color as settled_color
      from world_bosses b join zones z on z.id = b.zone_id
      left join guilds og on og.id = z.owner_guild_id
      left join guilds sg on sg.id = b.settled_guild_id
     where b.id = ${bossId}::bigint`) as unknown as Promise<{
      id: string; server_id: number; zone_id: number; zone_name: string; region: string; boss_code: string; status: 'scheduled' | 'active' | 'left';
      spawn_at: Date | string; leave_at: Date | string; total: string; stage: number; ld: string; loot_boxes: number; traits: unknown; weak: unknown;
      owner_id: string | null; owner_name: string | null; owner_emblem: string | null; owner_color: string | null;
      settled_name: string | null; settled_emblem: string | null; settled_color: string | null;
    }[]>,
    // 원정대 행 + 명단(json) — 모집 중은 전부, 종료는 **피해 상위 5팀 + 내 원정대**만(10-11 사용자). 나머지는 '더 보기'(getWorldBossDepartedMore).
    // 명단은 lateral json_agg로 같은 왕복에(10-11 3차) — 대원 행의 피해·뽑은 보상(0237)까지 실어 내 원정대(출발 뒤) 결과도 여기서 읽는다.
    db.execute(sql`
    with p0 as (
      select p.id, p.status, p.leader_user_id, p.guild_id, p.intro, p.created_at, p.departed_at, p.damage, p.rounds, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes, p.server_id,
             case when p.status = 'departed' then rank() over (partition by p.status order by p.damage desc, p.id) end as rk
        from world_boss_parties p where p.boss_id = ${bossId}::bigint and p.status in ('recruiting', 'departed')
    )
    select p.id::text as id, p.status, p.leader_user_id::text as leader, c.nickname as leader_nick, g.name as gname, g.emblem_url as gurl, g.emblem_color as gcolor, p.intro, p.created_at, p.departed_at,
           p.damage::text as damage, p.rounds, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes, p.rk::int as rk,
           (select count(*)::int from world_boss_party_members m where m.party_id = p.id) as n,
           (select count(*)::int from p0 x where x.status = 'departed') as total_departed,
           (select coalesce(json_agg(json_build_object('uid', m.user_id::text, 'dmg', m.damage::text, 'diamond', m.diamond, 'boxes', m.boxes) order by m.joined_at, m.user_id), '[]'::json)
              from world_boss_party_members m where m.party_id = p.id) as roster
      from p0 p
      left join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
      left join guilds g on g.id = p.guild_id
     where p.status = 'recruiting' or p.rk <= ${WORLD_BOSS_DEPARTED_TOP}
        or exists (select 1 from world_boss_party_members m where m.party_id = p.id and m.user_id = ${userId ?? null}::uuid)
     order by p.created_at`) as unknown as Promise<{
      id: string; status: 'recruiting' | 'departed'; leader: string; leader_nick: string | null; gname: string | null; gurl: string | null; gcolor: string | null; intro: string | null; created_at: Date | string; departed_at: Date | string | null;
      damage: string; rounds: number; stage_from: number | null; stage_to: number | null; reward_diamond: number; reward_boxes: number; rk: number | null; n: number; total_departed: number;
      roster: { uid: string; dmg: string; diamond: number; boxes: number }[] | null;
    }[]>,
    knownWeakOf(bossId),
    userId
      ? Promise.all([
          db.execute(sql`select m.party_id::text as pid, p.status, p.leader_user_id::text as leader from world_boss_party_members m join world_boss_parties p on p.id = m.party_id
                          where m.boss_id = ${bossId}::bigint and m.user_id = ${userId}::uuid limit 1`) as unknown as Promise<{ pid: string; status: 'recruiting' | 'departed'; leader: string }[]>,
          // 대기 중 신청 전부(여러 곳 동시 신청, 10-10) — 모집 중인 원정대 것만.
          db.execute(sql`select r.party_id::text as pid from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
                          where p.boss_id = ${bossId}::bigint and r.user_id = ${userId}::uuid and r.status = 'pending' and p.status = 'recruiting' order by r.created_at`) as unknown as Promise<{ pid: string }[]>,
          db.execute(sql`select guild_id::text as g from guild_members where user_id = ${userId}::uuid and server_id = ${serverId}`) as unknown as Promise<{ g: string }[]>,
          // 나에게 온 초대(10-11) — 참가 전이고 보스가 머무는 중일 때만 쓴다(아래에서 거른다).
          db.execute(sql`
            select i.party_id::text as pid, c.nickname as leader_nick, (select count(*)::int from world_boss_party_members m where m.party_id = i.party_id) as n
              from world_boss_invites i join world_boss_parties p on p.id = i.party_id
              join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
             where p.boss_id = ${bossId}::bigint and i.user_id = ${userId}::uuid and i.status = 'pending' and p.status = 'recruiting'
             order by i.created_at`) as unknown as Promise<{ pid: string; leader_nick: string; n: number }[]>,
          // 나를 내보낸 모집 중 원정대(0239 kicked) — 카드에 '참가 신청' 대신 '참가 불가'(10-11 3차).
          db.execute(sql`select r.party_id::text as pid from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
                          where p.boss_id = ${bossId}::bigint and r.user_id = ${userId}::uuid and r.status = 'kicked' and p.status = 'recruiting'`) as unknown as Promise<{ pid: string }[]>,
          // 내가 대장인 모집 중 원정대의 대기 신청·대기 초대 — 원정대 id를 몰라도 대장 조건으로 1단계에서 읽는다(10-11 3차).
          db.execute(sql`select r.user_id::text as uid from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
                          where p.boss_id = ${bossId}::bigint and p.leader_user_id = ${userId}::uuid and p.status = 'recruiting' and r.status = 'pending' order by r.created_at`) as unknown as Promise<{ uid: string }[]>,
          db.execute(sql`select i.user_id::text as uid from world_boss_invites i join world_boss_parties p on p.id = i.party_id
                          where p.boss_id = ${bossId}::bigint and p.leader_user_id = ${userId}::uuid and p.status = 'recruiting' and i.status = 'pending' order by i.created_at`) as unknown as Promise<{ uid: string }[]>,
        ])
      : Promise.resolve(null),
  ]);
  if (!b || b.server_id !== serverId || b.status === 'scheduled') return null;
  const active = b.status === 'active' && new Date(b.leave_at).getTime() > Date.now();
  // 떠나는 시각은 지났는데 크론(5분)이 아직 정산 전 — 화면은 '정산 중'으로(주인이 비어 "전리품이 사라졌어요"로 읽히던 것, 10-11 재검사).
  const settling = b.status === 'active' && !active;
  // 약점 총수는 저장된 묶음 크기로(특성 계산과 저장이 어긋난 옛 행에서 '15/9' 같은 분모가 나왔다, 10-11 재검사). 묶음이 비면 특성 기준.
  const weakSet = parseWeak(b.weak)[0];
  const weakTotal = weakSet ? weakSet.weapon.length + weakSet.armor.length + weakSet.accessory.length : worldBossWeakPerSlot(parseWorldBossTraits(b.traits)) * 3;
  // 특성 — 약점 보너스(치명 약점)는 전투력 계산 전부에, 약점 수(넓어진·치명)는 '밝혀짐 N/M'에.
  const traitCodes = parseWorldBossTraits(b.traits);
  const weakBonus = worldBossWeakBonus(traitCodes);

  let me: WorldBossMe | null = null;
  let myParty: WorldBossMyParty | null = null;
  let mine: WorldBossDetail['mine'] = null;
  const known = new Set(weakKnown.map((w) => w.code));
  const rosterOf = (p: (typeof partyRows)[number]) => (Array.isArray(p.roster) ? p.roster : []);

  // 내 상태(1단계 결과) — 2단계에서 누구의 사람 정보를 읽을지 정한다.
  const mem = mineRows?.[0]?.[0] ?? null;
  const reqs = mineRows?.[1] ?? [];
  const gm = mineRows?.[2]?.[0] ?? null;
  const invRows = mineRows?.[3] ?? [];
  const kickedRows = mineRows?.[4] ?? [];
  const leaderReqs = mem && mem.leader === userId && mem.status === 'recruiting' ? (mineRows?.[5] ?? []) : [];
  const leaderInvs = mem && mem.leader === userId && mem.status === 'recruiting' ? (mineRows?.[6] ?? []) : [];
  const state: WorldBossMe['state'] = !userId ? 'none' : mem ? (mem.status === 'departed' ? 'fought' : 'member') : reqs.length > 0 ? 'pending' : 'none';
  const wantMe = !!userId && active && state !== 'fought'; // 내 장착 상태·낙관 그리기용 내 사람 정보

  // 2단계 — 사람 정보(이름·문양·전투력·얼굴)는 한 번에: 모집 중 명단 + 내 원정대 대원(출발 뒤 포함) + 신청자·초대 + 나. 완료 원정대원은 이름·문양만 가볍게(namesOn).
  const peopleIds = new Set<string>();
  for (const p of partyRows) if (p.status === 'recruiting') for (const r of rosterOf(p)) peopleIds.add(r.uid);
  const myRow = mem ? partyRows.find((p) => p.id === mem.pid) : undefined;
  if (myRow) for (const r of rosterOf(myRow)) peopleIds.add(r.uid);
  for (const r of leaderReqs) peopleIds.add(r.uid);
  for (const r of leaderInvs) peopleIds.add(r.uid);
  if (wantMe && userId) peopleIds.add(userId);
  const nameIds = new Set<string>();
  for (const p of partyRows) if (p.status !== 'recruiting') for (const r of rosterOf(p)) if (!peopleIds.has(r.uid)) nameIds.add(r.uid);
  const [people, names, lo, best] = await Promise.all([
    peopleOn(serverId, [...peopleIds], known, weakBonus),
    namesOn(serverId, [...nameIds]),
    wantMe && userId ? loadoutsOf(serverId, [userId], known, weakBonus) : Promise.resolve(null),
    wantMe && userId ? bestLoadoutOf(serverId, userId, known, weakBonus) : Promise.resolve(null),
  ]);

  // 원정대 명단(10-10 사용자: 목록에서 누가 있는지 보이게) — 모집 중은 전투력(공개된 약점 기준), 완료는 그 전투의 피해. userId는 내리지 않는다(10-11 결정 ②).
  const membersOf = (p: (typeof partyRows)[number]) =>
    rosterOf(p)
      .map((r) => {
        const x = people.get(r.uid) ?? names.get(r.uid);
        return {
          nickname: x?.nickname ?? '알 수 없음', combat: people.get(r.uid)?.combat ?? 0, damage: Number(r.dmg),
          isLeader: r.uid === p.leader, guildEmblemUrl: x?.guildEmblemUrl ?? null, guildEmblemColor: x?.guildEmblemColor ?? null,
        };
      })
      .sort((x, y) => Number(y.isLeader) - Number(x.isLeader)); // 대장 먼저(안정 정렬이라 나머지는 참가 순 유지)
  const parties: WorldBossPartyCard[] = partyRows.map((p) => {
    const members = membersOf(p);
    return {
      id: p.id, status: p.status, leaderNickname: p.leader_nick ?? '알 수 없음', guildName: p.gname, guildEmblemUrl: p.gurl, guildEmblemColor: p.gcolor, intro: p.intro,
      members, combatSum: members.reduce((s, m) => s + m.combat, 0), memberCount: p.n,
      createdAt: ms(p.created_at)!, departedAt: ms(p.departed_at), damage: Number(p.damage), rounds: p.rounds,
      stageFrom: p.stage_from, stageTo: p.stage_to, rewardDiamond: p.reward_diamond, rewardBoxes: p.reward_boxes, rank: p.rk == null ? null : Number(p.rk),
    };
  });
  const departedTotal = Number(partyRows[0]?.total_departed ?? 0); // 모든 행이 같은 값
  if (userId && mineRows) {
    const isOwnerGuild = gm != null && b.owner_id != null && gm.g === b.owner_id;
    // 나에게 온 초대(10-11) — 참가 전이고 보스가 머무는 중일 때만 보인다.
    const invitesIn: WorldBossInviteIn[] = active && !mem ? invRows.map((r) => ({ partyId: r.pid, leaderNickname: r.leader_nick, memberCount: Number(r.n) })) : [];
    me = { userId, state, pendingPartyIds: mem ? [] : reqs.map((r) => r.pid), kickedPartyIds: kickedRows.map((r) => r.pid), canCreate: active && isOwnerGuild && state === 'none', isOwnerGuild, person: null, invites: invitesIn };
    if (wantMe) me.person = people.get(userId) ?? null; // 낙관적 '내 원정대' 그리기용(참가 전·모집 중 대원)
    if (mem && myRow) {
      const isLeader = mem.leader === userId;
      const person = (uid: string): WorldBossPerson =>
        people.get(uid) ?? { userId: uid, nickname: '알 수 없음', code: null, guildName: null, guildEmblemUrl: null, guildEmblemColor: null, combat: 0, weakCount: 0, avatarCount: 0, avatarSrc: null, faceBox: null, pieces: [] };
      // 대원 UUID는 대장(내보내기)에게만 — 대장이 아니면 나와 대장 것만 남기고 비운다(10-11 결정 ③).
      const uidFor = (uid: string) => (isLeader || uid === userId || uid === mem.leader ? uid : '');
      // 출발한 원정대 — 대원별 결과(준 피해·뽑은 보상)는 대원 행(0237)에 있다(우편과 같은 값). 얼굴 아래에 보인다(10-11 사용자).
      myParty = {
        partyId: mem.pid, status: mem.status, isLeader, leaderUserId: mem.leader,
        members: rosterOf(myRow)
          .map((r) => ({
            ...person(r.uid), userId: uidFor(r.uid), isLeader: r.uid === mem.leader,
            result: mem.status === 'departed' ? { damage: Number(r.dmg), diamond: Number(r.diamond ?? 0), boxes: Number(r.boxes ?? 0) } : undefined,
          }))
          .sort((x, y) => Number(y.isLeader) - Number(x.isLeader)), // 대장 먼저(10-11 사용자), 나머지는 참가 순(안정 정렬)
        requests: leaderReqs.map((r) => person(r.uid)),
        invites: leaderInvs.map((r) => person(r.uid)),
      };
    }
    // 내 장착 상태 — 이미 싸웠으면 바꿔도 의미가 없어 읽지 않는다.
    const l = lo?.get(userId);
    if (l) mine = { loadout: l, best: best && best.power > l.power ? { power: best.power, pieces: best.pieces, avatar: best.avatar, avatarChange: best.avatarId != null, hasAvatar: best.hasAvatar } : null };
  }

  const total = Number(b.total);
  const st = worldBossStageFor(total);
  return {
    id: b.id, serverId: b.server_id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, bossCode: b.boss_code, name: worldBossName(b.boss_code),
    status: active ? 'active' : settling ? 'settling' : 'left', spawnAt: ms(b.spawn_at)!, leaveAt: ms(b.leave_at)!, totalDamage: total,
    stage: b.stage, into: st.into, need: st.need, lootDiamond: Number(b.ld), lootBoxes: b.loot_boxes,
    ownerGuildName: b.owner_name, ownerGuildEmblem: b.owner_name ? { url: b.owner_emblem, color: b.owner_color } : null,
    // 정산 전(settling)엔 지금 주인이 곧 받을 길드 — 화면은 이 값을 '들어갈 예정'으로 보여 준다.
    settledGuildName: settling ? b.owner_name : b.settled_name, settledGuildEmblem: settling ? (b.owner_name ? { url: b.owner_emblem, color: b.owner_color } : null) : b.settled_name ? { url: b.settled_emblem, color: b.settled_color } : null,
    parties, departedTotal, me, myParty,
    weakKnown, weakTotal, weakBonus, mine,
    traits: traitCodes.map((c) => { const t = worldBossTraitDef(c)!; return { code: c, name: t.name, effect: t.effect, group: t.group }; }),
  };
}

/** 종료 시각 타이머용 가벼운 상태 1쿼리(10-11 3차 결정 ⑧) — 바뀐 것이 확인될 때만 화면 전체를 다시 읽는다. 예정·다른 서버면 null. */
/** 종료 시각 타이머·주기 확인용 가벼운 상태(1쿼리) — 상태 + 공개된 약점 수(약점이 밝혀지면 열어 둔 화면이 추천 조합을 다시 읽는다, 10-12). */
export async function getWorldBossStatus(bossId: string, serverId: number): Promise<{ state: WorldBossDetail['status']; weak: number } | null> {
  if (!/^\d{1,18}$/.test(bossId)) return null;
  const [r] = (await db.execute(sql`
    select b.status, (b.leave_at > now()) as alive, (select count(*)::int from world_boss_weak_reveals r where r.boss_id = b.id and r.phase = 0) as weak
      from world_bosses b where b.id = ${bossId}::bigint and b.server_id = ${serverId}`)) as unknown as { status: string; alive: boolean; weak: number }[];
  if (!r || r.status === 'scheduled') return null;
  return { state: r.status === 'left' ? 'left' : r.alive ? 'active' : 'settling', weak: Number(r.weak) };
}

/** 원정대 id → 보스 id(푸시 딥링크 /world-boss/party/<id> 변환용). */
export async function worldBossIdOfParty(partyId: string, serverId: number): Promise<string | null> {
  if (!/^\d{1,18}$/.test(partyId)) return null;
  const [r] = (await db.execute(sql`select boss_id::text as b from world_boss_parties where id = ${partyId}::bigint and server_id = ${serverId}`)) as unknown as { b: string }[];
  return r?.b ?? null;
}

const ms = (v: Date | string | null) => (v == null ? null : new Date(v).getTime());

/** 상세에 처음 실리는 종료 원정대 수(피해 상위). 나머지는 더 보기. */
export const WORLD_BOSS_DEPARTED_TOP = 5;

/**
 * 종료 목록 '더 보기'(10-11 사용자) — 상세에 실리지 않은 출발 원정대를 피해 순위대로(순위는 전체 기준) 20팀씩. shownIds = 이미 화면에 있는 원정대 id.
 */
export async function getWorldBossDepartedMore(bossId: string, serverId: number, shownIds: string[]): Promise<WorldBossPartyCard[]> {
  if (!/^\d+$/.test(bossId)) return [];
  const skip = shownIds.filter((x) => /^\d{1,18}$/.test(x)).slice(0, 200);
  const rows = (await db.execute(sql`
    with p0 as (
      select p.*, rank() over (order by p.damage desc, p.id) as rk
        from world_boss_parties p where p.boss_id = ${bossId}::bigint and p.server_id = ${serverId} and p.status = 'departed'
    )
    select p.id::text as id, p.leader_user_id::text as leader, c.nickname as leader_nick, g.name as gname, g.emblem_url as gurl, g.emblem_color as gcolor, p.intro, p.created_at, p.departed_at,
           p.damage::text as damage, p.rounds, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes, p.rk::int as rk,
           (select count(*)::int from world_boss_party_members m where m.party_id = p.id) as n
      from p0 p
      left join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
      left join guilds g on g.id = p.guild_id
     where not (p.id = any(${`{${skip.join(',')}}`}::bigint[]))
     order by p.rk
     limit 20`)) as unknown as {
    id: string; leader: string; leader_nick: string | null; gname: string | null; gurl: string | null; gcolor: string | null; intro: string | null; created_at: Date | string; departed_at: Date | string | null;
    damage: string; rounds: number; stage_from: number | null; stage_to: number | null; reward_diamond: number; reward_boxes: number; rk: number; n: number;
  }[];
  if (rows.length === 0) return [];
  const roster = (await db.execute(sql`
    select party_id::text as pid, user_id::text as uid, damage::text as dmg from world_boss_party_members
     where party_id = any(${`{${rows.map((r) => r.id).join(',')}}`}::bigint[]) order by joined_at, user_id`)) as unknown as { pid: string; uid: string; dmg: string }[];
  const names = await namesOn(serverId, roster.map((r) => r.uid));
  return rows.map((p) => {
    const members = roster
      .filter((r) => r.pid === p.id)
      .map((r) => {
        const x = names.get(r.uid);
        return { nickname: x?.nickname ?? '알 수 없음', combat: 0, damage: Number(r.dmg), isLeader: r.uid === p.leader, guildEmblemUrl: x?.guildEmblemUrl ?? null, guildEmblemColor: x?.guildEmblemColor ?? null };
      })
      .sort((x, y) => Number(y.isLeader) - Number(x.isLeader));
    return {
      id: p.id, status: 'departed' as const, leaderNickname: p.leader_nick ?? '알 수 없음', guildName: p.gname, guildEmblemUrl: p.gurl, guildEmblemColor: p.gcolor, intro: p.intro,
      members, combatSum: 0, memberCount: p.n,
      createdAt: ms(p.created_at)!, departedAt: ms(p.departed_at), damage: Number(p.damage), rounds: p.rounds,
      stageFrom: p.stage_from, stageTo: p.stage_to, rewardDiamond: p.reward_diamond, rewardBoxes: p.reward_boxes, rank: Number(p.rk),
    };
  });
}

/**
 * 출발한 원정대의 전투 기록(재생용) — **그 원정대원만** 볼 수 있다(10-11 사용자: 장착 장비·약점 추리 노출 제한). 다른 서버·미출발·기록 없음·대원 아님이면 null.
 * 기록의 user UUID는 클라에 내리지 않는다 — 얼굴·문양·대장은 명단 순번(인덱스)으로 잇는다.
 */
export async function getWorldBossBattle(partyId: string, serverId: number, viewerUserId: string): Promise<import('./view-types').WorldBossBattle | null> {
  if (!/^\d{1,18}$/.test(partyId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewerUserId)) return null;
  const [r] = (await db.execute(sql`
    select p.id::text as id, p.finale, p.stage_from, p.stage_to, p.reward_diamond, p.reward_boxes, c.nickname as leader, p.leader_user_id::text as leader_uid, b.boss_code
      from world_boss_parties p join world_bosses b on b.id = p.boss_id left join characters c on c.user_id = p.leader_user_id and c.server_id = p.server_id
     where p.id = ${partyId}::bigint and p.server_id = ${serverId} and p.status = 'departed'
       and exists (select 1 from world_boss_party_members m where m.party_id = p.id and m.user_id = ${viewerUserId}::uuid)`)) as unknown as {
    id: string; finale: (Omit<import('./view-types').WorldBossBattle['finale'], 'roster'> & { roster: ({ userId: string } & import('./view-types').WorldBossBattle['finale']['roster'][number])[] }) | null; stage_from: number | null; stage_to: number | null;
    reward_diamond: number; reward_boxes: number; leader: string | null; leader_uid: string; boss_code: string;
  }[];
  if (!r?.finale) return null;
  const ids = r.finale.roster.map((m) => m.userId).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const [faces, guildRows] = await Promise.all([
    profilesByIds(ids, serverId).catch(() => []),
    ids.length > 0
      ? (db.execute(sql`
          select gm.user_id::text as uid, g.id::text as gid, g.name, g.emblem_url as url, g.emblem_color as color
            from guild_members gm join guilds g on g.id = gm.guild_id
           where gm.server_id = ${serverId} and gm.user_id = any(${`{${ids.join(',')}}`}::uuid[])`) as unknown as Promise<{ uid: string; gid: string; name: string; url: string | null; color: string | null }[]>)
      : Promise.resolve([]),
  ]);
  // 얼굴·문양은 명단 순번으로(UUID는 서버에서만 쓴다, 10-11 사용자).
  const faceOf = new Map(faces.map((f) => [f.userId, f]));
  const guildOf = new Map(guildRows.map((g) => [g.uid, g]));
  const avatars: import('./view-types').WorldBossBattle['avatars'] = {};
  const guildEmblems: NonNullable<import('./view-types').WorldBossBattle['guildEmblems']> = {};
  r.finale.roster.forEach((m, i) => {
    const f = faceOf.get(m.userId);
    if (f) avatars[i] = { src: f.profileSouth, box: f.faceBox ?? null };
    // 길드 문양 — 기록엔 이름만 있어 지금 소속의 문양을 쓰되, 그 사이 길드를 옮긴 사람은 빼놓는다(다른 길드 문양이 붙지 않게).
    const g = guildOf.get(m.userId);
    // 기록의 길드 id(출발 스냅샷)로 대조 — 길드 이름을 바꿔도 문양이 남는다(10-11 3차 결정 ⑦). id가 없는 옛 기록은 이름으로.
    const gid = (m as { guildId?: string | number | null }).guildId;
    if (g && (gid != null ? String(gid) === g.gid : m.guildName === g.name)) guildEmblems[i] = { url: g.url, color: g.color };
  });
  const roster = r.finale.roster.map(({ userId: _uid, ...rest }) => rest);
  return {
    avatars,
    guildEmblems,
    partyId: r.id,
    leaderNickname: r.leader ?? '알 수 없음',
    bossCode: r.boss_code,
    leaderIndex: r.finale.roster.findIndex((m) => m.userId === r.leader_uid),
    finale: { ...r.finale, roster },
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
    select z.name as zone, b.boss_code, b.stage, b.loot_diamond::text as ld, b.loot_boxes
      from world_bosses b join zones z on z.id = b.zone_id
     where b.server_id = ${serverId} and b.status <> 'scheduled'
       and b.spawn_at <= (${kstDay}::date + time '23:00') at time zone 'Asia/Seoul'
       and b.leave_at > ((${kstDay}::date + 1)::timestamp) at time zone 'Asia/Seoul'`)) as unknown as {
    zone: string; boss_code: string; stage: number; ld: string; loot_boxes: number;
  }[];
  return rows.map((r) => ({ zone: r.zone, name: worldBossName(r.boss_code), stage: r.stage, lootDiamond: Number(r.ld), lootBoxes: r.loot_boxes }));
}

/**
 * 초대 후보(10-11 사용자 2안) — 대장의 친구 + 같은 길드원 중 이 서버에 캐릭터가 있는 사람. 상태: ok(초대 가능) · invited(대기 중) ·
 * in_party(이 보스의 다른 원정대 모집 중) · fought(이미 싸움). 정렬은 초대 가능 먼저, 그다음 전투력 높은 순.
 */
export async function getWorldBossInvitable(serverId: number, userId: string, partyId: string): Promise<WorldBossInvitable[]> {
  const [party] = (await db.execute(sql`
    select p.boss_id::text as boss_id, b.traits, b.stage from world_boss_parties p join world_bosses b on b.id = p.boss_id
     where p.id = ${partyId}::bigint and p.server_id = ${serverId} and p.leader_user_id = ${userId}::uuid`)) as unknown as { boss_id: string; traits: unknown; stage: number }[];
  if (!party) return [];
  const traits = parseWorldBossTraits(party.traits);
  const [friendIds, guildRows, weakRows] = await Promise.all([
    getFriendIds(userId, serverId),
    db.execute(sql`
      select b.user_id::text as uid from guild_members a join guild_members b on b.guild_id = a.guild_id and b.server_id = a.server_id
       where a.server_id = ${serverId} and a.user_id = ${userId}::uuid and b.user_id <> ${userId}::uuid`) as unknown as Promise<{ uid: string }[]>,
    knownWeakOf(party.boss_id), // 친구·길드 조회와 무관 — 같이(10-11 감사)
  ]);
  const friends = new Set(friendIds);
  const guild = new Set(guildRows.map((r) => r.uid));
  const ids = [...new Set([...friends, ...guild])].filter((x) => x !== userId);
  if (ids.length === 0) return [];
  const known = new Set(weakRows.map((w) => w.code));
  const [people, taken, invited, faces] = await Promise.all([
    peopleOn(serverId, ids, known, worldBossWeakBonus(traits)),
    db.execute(sql`
      select m.user_id::text as uid, p.status from world_boss_party_members m join world_boss_parties p on p.id = m.party_id
       where m.boss_id = ${party.boss_id}::bigint and m.user_id = any(${`{${ids.join(',')}}`}::uuid[])`) as unknown as Promise<{ uid: string; status: string }[]>,
    db.execute(sql`select user_id::text as uid from world_boss_invites where party_id = ${partyId}::bigint and status = 'pending'`) as unknown as Promise<{ uid: string }[]>,
    profilesByIds(ids, serverId).catch(() => []),
  ]);
  const seen = new Map(faces.map((f) => [f.userId, f.lastSeenAt ?? null] as const));
  const takenMap = new Map(taken.map((t) => [t.uid, t.status] as const));
  const invitedSet = new Set(invited.map((i) => i.uid));
  const out: WorldBossInvitable[] = [];
  for (const id of ids) {
    const p = people.get(id);
    if (!p) continue; // 이 서버에 캐릭터가 없으면 초대할 수 없다
    const t = takenMap.get(id);
    const state: WorldBossInvitable['state'] = t === 'departed' ? 'fought' : t ? 'in_party' : invitedSet.has(id) ? 'invited' : 'ok';
    out.push({ ...p, source: friends.has(id) && guild.has(id) ? 'both' : friends.has(id) ? 'friend' : 'guild', state, lastSeenAt: seen.get(id) ?? null });
  }
  const rank = { ok: 0, invited: 1, in_party: 2, fought: 3 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.combat - a.combat || a.nickname.localeCompare(b.nickname, 'ko'));
}
