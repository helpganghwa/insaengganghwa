import 'server-only';

import { sql } from 'drizzle-orm';
import { josa } from 'josa';

import { db } from '@/lib/db/client';
import { randomUUID } from 'node:crypto';

import { pieceCombatPower } from '@/lib/game/balance';
import { WORLD_BOSS_PARTY_INTRO_MAX, WORLD_BOSS_PARTY_MAX, worldBossLootFor, worldBossStageFor } from '@/lib/game/guild/balance';
import { isConquestLocked } from '@/lib/game/guild/conquest/schedule';
import { sendPushToUsers } from '@/lib/push/send';

import { worldBossName } from './bosses';
import { WorldBossError } from './errors';
import { simulateWorldBoss, type WorldBossFinale, type WorldBossItem, type WorldBossUnit } from './simulate';
import type { WeakSlot } from './weak';
import { ensureBossWeak } from './weak-server';

/**
 * 원정대(docs/WORLD-BOSS.md §2·§3·§4) — 만들기·참가 신청·수락/거절·나가기·출발.
 * 잠금 순서: world_bosses → world_boss_parties → world_boss_party_members. 출발은 멱등 키 + 조건부 상태 전이.
 * "보스 하나에 1인 1번"은 members의 (boss_id, user_id) 유니크가 최후 방어선이다.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Dbx = Pick<typeof db, 'execute'>;

/** id 목록 → Postgres 배열 리터럴('{1,2}'). drizzle은 JS 배열을 튜플로 펼쳐 ::bigint[] 캐스트가 깨진다. 숫자 문자열만 받는다. */
function pgBigintArray(ids: readonly string[]): string {
  for (const id of ids) if (!/^\d+$/.test(id)) throw new Error(`bad id: ${id}`);
  return `{${ids.join(',')}}`;
}

type BossRow = { id: string; server_id: number; zone_id: number; region: string; status: string; leave_at: string; owner: string | null; zone_name: string };

/** 보스 행 잠금 + 출현 중인지. 떠나는 시각이 지났으면(크론이 아직 정산 전) 출현 중이 아니다. */
async function lockActiveBoss(tx: Tx, bossId: string): Promise<BossRow> {
  const [b] = (await tx.execute(sql`
    select b.id::text as id, b.server_id, b.zone_id, b.region::text as region, b.status, b.leave_at, z.owner_guild_id::text as owner, z.name as zone_name
      from world_bosses b join zones z on z.id = b.zone_id where b.id = ${bossId}::bigint for update of b
  `)) as unknown as BossRow[];
  if (!b) throw new WorldBossError('NOT_FOUND');
  if (b.status !== 'active' || new Date(b.leave_at).getTime() <= Date.now()) throw new WorldBossError('BOSS_NOT_ACTIVE');
  return b;
}

async function hasCharacter(dbx: Dbx, userId: string, serverId: number): Promise<boolean> {
  const r = (await dbx.execute(sql`select 1 as x from characters where user_id = ${userId}::uuid and server_id = ${serverId} limit 1`)) as unknown as unknown[];
  return r.length > 0;
}

async function guildOf(dbx: Dbx, userId: string, serverId: number): Promise<string | null> {
  const [m] = (await dbx.execute(sql`select guild_id::text as g from guild_members where user_id = ${userId}::uuid and server_id = ${serverId}`)) as unknown as { g: string }[];
  return m?.g ?? null;
}

/** 이 보스에 이미 참가(모집 중 또는 출발)했는지 — 유니크 키와 같은 판정을 미리 해 알맞은 오류를 준다. */
async function participation(dbx: Dbx, bossId: string, userId: string): Promise<'none' | 'recruiting' | 'fought'> {
  const [r] = (await dbx.execute(sql`
    select p.status from world_boss_party_members m join world_boss_parties p on p.id = m.party_id
     where m.boss_id = ${bossId}::bigint and m.user_id = ${userId}::uuid limit 1`)) as unknown as { status: string }[];
  if (!r) return 'none';
  return r.status === 'departed' ? 'fought' : 'recruiting';
}

/** 원정대 만들기 — 보스 구역을 점령한 길드의 길드원만. 만든 사람이 대장이자 첫 참가자. */
/** 소개글 정리 — 공백은 한 칸으로, WORLD_BOSS_PARTY_INTRO_MAX자까지, 비면 null(안 적은 것). */
function cleanIntro(raw: string | undefined): string | null {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, WORLD_BOSS_PARTY_INTRO_MAX);
  return s.length > 0 ? s : null;
}

export async function createParty(input: { userId: string; serverId: number; bossId: string; intro?: string }): Promise<{ partyId: string }> {
  const intro = cleanIntro(input.intro);
  return db.transaction(async (tx) => {
    const boss = await lockActiveBoss(tx, input.bossId);
    if (boss.server_id !== input.serverId) throw new WorldBossError('NOT_FOUND');
    if (!(await hasCharacter(tx, input.userId, input.serverId))) throw new WorldBossError('NO_CHARACTER');
    const g = await guildOf(tx, input.userId, input.serverId);
    if (!boss.owner || !g || g !== boss.owner) throw new WorldBossError('NOT_OWNER_GUILD');
    const p = await participation(tx, boss.id, input.userId);
    if (p === 'fought') throw new WorldBossError('ALREADY_FOUGHT');
    if (p === 'recruiting') throw new WorldBossError('ALREADY_IN_PARTY');
    const [party] = (await tx.execute(sql`
      insert into world_boss_parties (boss_id, server_id, leader_user_id, guild_id, intro)
      values (${boss.id}::bigint, ${input.serverId}, ${input.userId}::uuid, ${boss.owner}::bigint, ${intro}) returning id::text as id`)) as unknown as { id: string }[];
    await tx.execute(sql`
      insert into world_boss_party_members (party_id, boss_id, user_id, server_id)
      values (${party!.id}::bigint, ${boss.id}::bigint, ${input.userId}::uuid, ${input.serverId})`);
    return { partyId: party!.id };
  });
}

type PartyRow = { id: string; boss_id: string; server_id: number; leader: string; guild_id: string; status: string; depart_key: string | null; damage: string; reward_diamond: number; reward_boxes: number; stage_from: number | null; stage_to: number | null; rounds: number };

async function lockParty(tx: Tx, partyId: string): Promise<PartyRow> {
  const [p] = (await tx.execute(sql`
    select id::text as id, boss_id::text as boss_id, server_id, leader_user_id::text as leader, guild_id::text as guild_id, status, depart_key,
           damage::text as damage, reward_diamond, reward_boxes, stage_from, stage_to, rounds
      from world_boss_parties where id = ${partyId}::bigint for update`)) as unknown as PartyRow[];
  if (!p) throw new WorldBossError('NOT_FOUND');
  return p;
}

async function memberCount(tx: Tx, partyId: string): Promise<number> {
  const [r] = (await tx.execute(sql`select count(*)::int as n from world_boss_party_members where party_id = ${partyId}::bigint`)) as unknown as { n: number }[];
  return Number(r?.n ?? 0);
}

/** 참가 신청 — 누구나(다른 길드·무소속). 대장이 수락해야 참가. */
export async function requestJoin(input: { userId: string; serverId: number; partyId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const party = await lockParty(tx, input.partyId);
    if (party.server_id !== input.serverId) throw new WorldBossError('NOT_FOUND');
    if (party.status !== 'recruiting') throw new WorldBossError('PARTY_NOT_RECRUITING');
    const boss = await lockActiveBoss(tx, party.boss_id);
    if (!(await hasCharacter(tx, input.userId, input.serverId))) throw new WorldBossError('NO_CHARACTER');
    const p = await participation(tx, boss.id, input.userId);
    if (p === 'fought') throw new WorldBossError('ALREADY_FOUGHT');
    if (p === 'recruiting') throw new WorldBossError('ALREADY_IN_PARTY');
    if ((await memberCount(tx, party.id)) >= WORLD_BOSS_PARTY_MAX) throw new WorldBossError('PARTY_FULL');
    // 같은 보스에는 대기 중 신청 하나만(화면 시안 10-07) — 여러 대장에게 동시에 걸어 두고 먼저 받아 주는 곳으로 가는 것을 막는다.
    const [other] = (await tx.execute(sql`
      select 1 as x from world_boss_join_requests r join world_boss_parties p on p.id = r.party_id
       where p.boss_id = ${party.boss_id}::bigint and r.user_id = ${input.userId}::uuid and r.status = 'pending' and r.party_id <> ${party.id}::bigint
       limit 1`)) as unknown as unknown[];
    if (other) throw new WorldBossError('ALREADY_REQUESTED');
    const ins = (await tx.execute(sql`
      insert into world_boss_join_requests (party_id, user_id) values (${party.id}::bigint, ${input.userId}::uuid)
      on conflict (party_id, user_id) do nothing returning user_id`)) as unknown as unknown[];
    if (ins.length === 0) throw new WorldBossError('ALREADY_REQUESTED');
  });
  // 대장에게 알림(best-effort).
  const [p] = (await db.execute(sql`select leader_user_id::text as leader from world_boss_parties where id = ${input.partyId}::bigint`)) as unknown as { leader: string }[];
  if (p) {
    await sendPushToUsers([p.leader], {
      title: '원정대 참가 신청',
      body: '원정대에 참가 신청이 들어왔어요. 수락하면 함께 출발해요.',
      url: `/world-boss/party/${input.partyId}`,
      tag: `world-boss-party-${input.partyId}`,
      category: 'world_boss',
    }).catch(() => {});
  }
}

/** 수락·거절 — 대장만. 수락은 인원·1인 1번을 다시 검사한다. */
export async function decideJoin(input: { leaderUserId: string; serverId: number; partyId: string; userId: string; accept: boolean }): Promise<void> {
  await db.transaction(async (tx) => {
    const party = await lockParty(tx, input.partyId);
    if (party.server_id !== input.serverId) throw new WorldBossError('NOT_FOUND');
    if (party.leader !== input.leaderUserId) throw new WorldBossError('NOT_LEADER');
    if (party.status !== 'recruiting') throw new WorldBossError('PARTY_NOT_RECRUITING');
    const [req] = (await tx.execute(sql`
      select status from world_boss_join_requests where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid for update`)) as unknown as { status: string }[];
    if (!req || req.status !== 'pending') throw new WorldBossError('NO_REQUEST');
    if (!input.accept) {
      await tx.execute(sql`update world_boss_join_requests set status = 'rejected', decided_at = now() where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid`);
      return;
    }
    await lockActiveBoss(tx, party.boss_id);
    if ((await memberCount(tx, party.id)) >= WORLD_BOSS_PARTY_MAX) throw new WorldBossError('PARTY_FULL');
    // 그 사이 다른 원정대에 들어갔거나 이미 싸웠으면 유니크가 막는다 — 신청은 거절로 닫는다.
    const ins = (await tx.execute(sql`
      insert into world_boss_party_members (party_id, boss_id, user_id, server_id)
      values (${party.id}::bigint, ${party.boss_id}::bigint, ${input.userId}::uuid, ${party.server_id})
      on conflict (boss_id, user_id) do nothing returning user_id`)) as unknown as unknown[];
    if (ins.length === 0) {
      await tx.execute(sql`update world_boss_join_requests set status = 'rejected', decided_at = now() where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid`);
      throw new WorldBossError('ALREADY_IN_PARTY');
    }
    await tx.execute(sql`update world_boss_join_requests set status = 'accepted', decided_at = now() where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid`);
  });
  if (input.accept) {
    await sendPushToUsers([input.userId], {
      title: '원정대 참가',
      body: '원정대에 들어갔어요. 원정대장이 출발을 누르면 전투가 시작돼요.',
      url: `/world-boss/party/${input.partyId}`,
      tag: `world-boss-party-${input.partyId}`,
      category: 'world_boss',
    }).catch(() => {});
  }
}

/** 모집 중 원정대 해산(트랜잭션 안) — 참가자 행·신청을 지워 다시 참가할 수 있게. */
async function disbandInTx(tx: Tx, partyId: string, reason: 'leader' | 'leader_left' | 'owner_changed' | 'boss_left'): Promise<void> {
  await tx.execute(sql`update world_boss_parties set status = 'disbanded', disband_reason = ${reason} where id = ${partyId}::bigint and status = 'recruiting'`);
  await tx.execute(sql`delete from world_boss_party_members where party_id = ${partyId}::bigint`);
  await tx.execute(sql`delete from world_boss_join_requests where party_id = ${partyId}::bigint`);
}

/** 나가기 — 출발 전만. 대장이 나가면 해산. */
export async function leaveParty(input: { userId: string; serverId: number; partyId: string }): Promise<{ disbanded: boolean }> {
  return db.transaction(async (tx) => {
    const party = await lockParty(tx, input.partyId);
    if (party.server_id !== input.serverId) throw new WorldBossError('NOT_FOUND');
    if (party.status !== 'recruiting') throw new WorldBossError('PARTY_NOT_RECRUITING');
    if (party.leader === input.userId) {
      await disbandInTx(tx, party.id, 'leader');
      return { disbanded: true };
    }
    const del = (await tx.execute(sql`
      delete from world_boss_party_members where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid returning user_id`)) as unknown as unknown[];
    if (del.length === 0) throw new WorldBossError('NOT_MEMBER');
    // 신청 기록도 지운다 — 나갔다가 같은 원정대에 다시 신청할 수 있게.
    await tx.execute(sql`delete from world_boss_join_requests where party_id = ${party.id}::bigint and user_id = ${input.userId}::uuid`);
    return { disbanded: false };
  });
}

/** 참가 신청 취소(본인). */
export async function cancelJoinRequest(input: { userId: string; partyId: string }): Promise<void> {
  await db.execute(sql`delete from world_boss_join_requests where party_id = ${input.partyId}::bigint and user_id = ${input.userId}::uuid and status = 'pending'`);
}

export type DepartResult = {
  partyId: string;
  duplicate: boolean;
  damage: number;
  rounds: number;
  stageFrom: number;
  stageTo: number;
  /** 원정대 전체가 공격마다 뽑은 보상의 합(원정대원마다 다르다 — 각자 몫은 finale.drops). */
  reward: { diamond: number; boxes: number };
  finale: WorldBossFinale | null;
};

/**
 * 출발 — 대장만, 점령전 잠금(23~01시)이 아닐 때. 결과는 여기서 한 번에 정한다. 시드에 서버 난수를 섞는다 — 공격마다
 * 뽑는 보상(복권)을 원정대 id만으로 미리 계산해 출발 시점을 고르는 일을 막는다(CLAUDE §3.1).
 * 같은 departKey 재전송은 저장된 결과를 돌려준다(한 번만 출발).
 */
export async function departParty(input: { leaderUserId: string; serverId: number; partyId: string; departKey: string }): Promise<DepartResult> {
  if (!/^[0-9a-f-]{36}$/i.test(input.departKey)) throw new WorldBossError('NOT_FOUND');
  const result = await db.transaction(async (tx): Promise<DepartResult & { memberIds: string[]; zoneName: string; bossName: string }> => {
    // 잠금 순서: 보스 → 원정대. 보스를 먼저 잠가 같은 보스의 동시 출발이 단계 계산에서 직렬화되게.
    const [pre] = (await tx.execute(sql`select boss_id::text as b from world_boss_parties where id = ${input.partyId}::bigint`)) as unknown as { b: string }[];
    if (!pre) throw new WorldBossError('NOT_FOUND');
    const bossLocked = (await tx.execute(sql`select id::text as id, status, leave_at, region::text as region, zone_id, total_damage::text as total_damage, weak from world_bosses where id = ${pre.b}::bigint for update`)) as unknown as { id: string; status: string; leave_at: string; region: string; zone_id: number; total_damage: string; weak: unknown }[];
    const party = await lockParty(tx, input.partyId);
    if (party.server_id !== input.serverId) throw new WorldBossError('NOT_FOUND');
    if (party.leader !== input.leaderUserId) throw new WorldBossError('NOT_LEADER');
    const [zone] = (await tx.execute(sql`select name from zones where id = ${bossLocked[0]?.zone_id ?? 0}`)) as unknown as { name: string }[];
    const bossName = worldBossName(bossLocked[0]?.region ?? '');
    if (party.status === 'departed') {
      if (party.depart_key === input.departKey) {
        const [f] = (await tx.execute(sql`select finale from world_boss_parties where id = ${party.id}::bigint`)) as unknown as { finale: WorldBossFinale | null }[];
        return {
          partyId: party.id, duplicate: true, damage: Number(party.damage), rounds: party.rounds, stageFrom: party.stage_from ?? 0, stageTo: party.stage_to ?? 0,
          reward: { diamond: party.reward_diamond, boxes: party.reward_boxes }, finale: f?.finale ?? null, memberIds: [], zoneName: zone?.name ?? '', bossName,
        };
      }
      throw new WorldBossError('PARTY_NOT_RECRUITING');
    }
    if (party.status !== 'recruiting') throw new WorldBossError('PARTY_NOT_RECRUITING');
    const b = bossLocked[0];
    if (!b || b.status !== 'active' || new Date(b.leave_at).getTime() <= Date.now()) throw new WorldBossError('BOSS_NOT_ACTIVE');
    if (isConquestLocked()) throw new WorldBossError('LOCKED');

    // 참가자(참가 순) + 닉네임·길드 + 대표 아바타(만들 때 입은 장비) — 전투력 규칙은 docs/WORLD-BOSS.md §3.
    const members = (await tx.execute(sql`
      select m.user_id::text as uid, c.nickname, gm.guild_id::text as gid, g.name as gname,
             up.equipment_snapshot as snap, coalesce((up.options->>'isDefault')::boolean, false) as is_default
        from world_boss_party_members m
        join characters c on c.user_id = m.user_id and c.server_id = m.server_id
        left join user_profiles up on up.id = c.active_profile_id
        left join guild_members gm on gm.user_id = m.user_id and gm.server_id = m.server_id
        left join guilds g on g.id = gm.guild_id
       where m.party_id = ${party.id}::bigint order by m.joined_at, m.user_id`)) as unknown as {
      uid: string; nickname: string; gid: string | null; gname: string | null; snap: unknown; is_default: boolean;
    }[];
    if (members.length === 0) throw new WorldBossError('NOT_MEMBER');
    const ids = members.map((m) => m.uid);
    // 출발 순간 장착한 장비(부위당 하나) — 전투력 스냅샷.
    const eqRows = (await tx.execute(sql`
      select ue.user_id::text as uid, ci.code, ci.slot::text as slot, ue.enhance_level as el, ue.transcend_level as tl
        from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.server_id = ${input.serverId} and ue.equipped_slot is not null
         and ue.user_id in (select user_id from world_boss_party_members where party_id = ${party.id}::bigint)`)) as unknown as {
      uid: string; code: string; slot: string; el: number; tl: number;
    }[];
    const equipped = new Map<string, { slot: WeakSlot; code: string; cp: number }[]>();
    for (const r of eqRows) {
      if (r.slot !== 'weapon' && r.slot !== 'armor' && r.slot !== 'accessory') continue;
      const arr = equipped.get(r.uid) ?? [];
      arr.push({ slot: r.slot, code: r.code, cp: Math.round(pieceCombatPower(Number(r.el), Number(r.tl))) });
      equipped.set(r.uid, arr);
    }
    const units: WorldBossUnit[] = members.map((m) => {
      const snap = (!m.is_default && m.snap && typeof m.snap === 'object' ? m.snap : null) as Record<string, unknown> | null;
      const avatarKey = (slot: WeakSlot) => (snap ? snap[`${slot}Key`] : undefined);
      const items: WorldBossItem[] = (equipped.get(m.uid) ?? []).map((it) => ({ ...it, av: !!snap && avatarKey(it.slot) === it.code }));
      return { userId: m.uid, nickname: m.nickname, items, hasAvatar: !!snap && typeof snap.weaponKey === 'string', guildId: m.gid, guildName: m.gname };
    });
    const weak = await ensureBossWeak(tx, b.id, b.weak);
    const sim = simulateWorldBoss(units, `worldboss:${party.id}:${randomUUID()}`, { startDamage: Number(b.total_damage), weak });

    // 보스 누적 피해 → 단계·전리품(절대값으로 다시 계산 — 증분 누적의 어긋남 방지).
    const [tot] = (await tx.execute(sql`
      update world_bosses set total_damage = total_damage + ${sim.totalDamage}::bigint where id = ${b.id}::bigint returning total_damage::text as t, stage`)) as unknown as { t: string; stage: number }[];
    const stageFrom = Number(tot!.stage);
    const stageTo = worldBossStageFor(Number(tot!.t)).stage;
    if (stageTo !== stageFrom) {
      const loot = worldBossLootFor(stageTo);
      await tx.execute(sql`update world_bosses set stage = ${stageTo}, loot_diamond = ${loot.diamond}::bigint, loot_boxes = ${loot.boxes} where id = ${b.id}::bigint`);
    }
    const reward = sim.members.reduce((s, m) => ({ diamond: s.diamond + m.diamond, boxes: s.boxes + m.boxes }), { diamond: 0, boxes: 0 });

    // 처음 맞힌 약점 공개 — 보스 행을 잠근 채라 원정대끼리 순서가 정해지고, 이미 공개된 것은 그대로(먼저 맞힌 사람이 발견자).
    for (const r of sim.reveals) {
      const who = units[r.unit]!;
      await tx.execute(sql`
        insert into world_boss_weak_reveals (boss_id, phase, code, slot, finder_user_id, finder_nickname, party_id)
        values (${b.id}::bigint, ${r.phase}, ${r.code}, ${r.slot}, ${who.userId}::uuid, ${who.nickname}, ${party.id}::bigint)
        on conflict (boss_id, phase, code) do nothing`);
    }
    for (const m of sim.members) {
      await tx.execute(sql`
        update world_boss_party_members set attacks = ${m.attacks}, damage = ${m.damage}::bigint, fell_round = ${m.fellRound}
         where party_id = ${party.id}::bigint and user_id = ${m.userId}::uuid`);
    }
    await tx.execute(sql`
      update world_boss_parties
         set status = 'departed', departed_at = now(), rounds = ${sim.rounds}, damage = ${sim.totalDamage}::bigint,
             stage_from = ${stageFrom}, stage_to = ${stageTo}, finale = ${JSON.stringify(sim.finale)}::jsonb,
             reward_diamond = ${reward.diamond}, reward_boxes = ${reward.boxes}, depart_key = ${input.departKey}::uuid
       where id = ${party.id}::bigint and status = 'recruiting'`);
    await tx.execute(sql`delete from world_boss_join_requests where party_id = ${party.id}::bigint`);

    // 보상 우편 — 원정대원마다 공격에서 뽑은 만큼(복권). 아무것도 못 뽑은 사람은 우편 없음(결과 화면에서 확인).
    const fight = josa(
      `${zone?.name ?? ''}의 ${bossName}#{을} 상대로 원정대가 ${sim.rounds}라운드 동안 ${sim.totalDamage.toLocaleString('ko-KR')} 피해를 입혀 ${stageFrom}단계에서 ${stageTo}단계까지 올렸어요.`,
    );
    for (const m of sim.members) {
      if (m.diamond <= 0 && m.boxes <= 0) continue;
      const per = Math.floor(m.boxes / 3);
      const payload = JSON.stringify({ diamond: m.diamond, boxes: { weapon: per, armor: per, accessory: per } });
      const body = `${fight} ${m.attacks}번 공격해 얻은 보상이에요.`;
      await tx.execute(sql`
        insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
        values (${m.userId}::uuid, ${input.serverId}, 'world_boss'::mailbox_type, '월드보스 원정 보상', ${body}, '월드보스', ${payload}::jsonb, now() + interval '30 days')`);
    }

    return { partyId: party.id, duplicate: false, damage: sim.totalDamage, rounds: sim.rounds, stageFrom, stageTo, reward, finale: sim.finale, memberIds: ids, zoneName: zone?.name ?? '', bossName };
  });
  if (!result.duplicate && result.memberIds.length > 0) {
    await sendPushToUsers(result.memberIds, {
      title: '원정대 결과',
      body: `${result.zoneName}의 ${result.bossName}에게 ${result.damage.toLocaleString('ko-KR')} 피해를 입혔어요. 공격마다 얻은 보상을 확인하세요.`,
      url: `/world-boss/party/${result.partyId}`,
      tag: `world-boss-party-${result.partyId}`,
      category: 'world_boss',
    }).catch(() => {});
  }
  const { memberIds: _m, zoneName: _z, bossName: _b, ...out } = result;
  return out;
}

/**
 * 구역 주인 동기화 — 자정 공개·길드 해산 뒤 호출. 출현 중인 보스의 모집 중 원정대 가운데 만든 길드가 더는
 * 구역 주인이 아니면 해산(owner_changed). 참가자는 다시 참가할 수 있다. 싸운 기록은 그대로.
 */
export async function syncWorldBossOwners(serverId: number, dbx: Dbx = db): Promise<number> {
  const rows = (await dbx.execute(sql`
    update world_boss_parties p set status = 'disbanded', disband_reason = 'owner_changed'
      from world_bosses b join zones z on z.id = b.zone_id
     where p.boss_id = b.id and p.status = 'recruiting' and b.server_id = ${serverId} and b.status = 'active'
       and (z.owner_guild_id is null or z.owner_guild_id <> p.guild_id)
    returning p.id::text as id`)) as unknown as { id: string }[];
  if (rows.length === 0) return 0;
  const ids = pgBigintArray(rows.map((r) => r.id));
  await dbx.execute(sql`delete from world_boss_party_members where party_id = any(${ids}::bigint[])`);
  await dbx.execute(sql`delete from world_boss_join_requests where party_id = any(${ids}::bigint[])`);
  return rows.length;
}

/** 길드 이탈(탈퇴·추방) 또는 계정 탈퇴(serverId null = 전 서버) — 그 사람이 대장인 모집 중 원정대 해산. 참가자로 있는 건 그대로(참가는 누구나). */
export async function clearWorldBossOnExit(tx: Tx, userId: string, serverId: number | null): Promise<void> {
  const rows = (await tx.execute(sql`
    update world_boss_parties set status = 'disbanded', disband_reason = 'leader_left'
     where leader_user_id = ${userId}::uuid and status = 'recruiting' and (${serverId}::smallint is null or server_id = ${serverId}::smallint)
     returning id::text as id`)) as unknown as { id: string }[];
  if (rows.length === 0) return;
  const ids = pgBigintArray(rows.map((r) => r.id));
  await tx.execute(sql`delete from world_boss_party_members where party_id = any(${ids}::bigint[])`);
  await tx.execute(sql`delete from world_boss_join_requests where party_id = any(${ids}::bigint[])`);
}
