import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { adminActions } from '@/lib/db/schema/ops';
import { WORLD_BOSS_STAY_MS, drawWorldBossTraits, worldBossWeakPerSlot } from '@/lib/game/guild/balance';
import { kstDateString } from '@/lib/kst';

import { activateDueBosses } from './spawn';
import { cryptoRand, drawWeakForNewBoss } from './weak-server';

/**
 * 관리자 소환(docs/WORLD-BOSS.md §1, 10-11 사용자): 자동 추첨 없이 관리자가 구역을 지정해 **즉시** 또는 **예약**으로 소환한다.
 *  · 구역당 출현 중/예정은 한 마리(구역 행 FOR UPDATE + 같은 트랜잭션 검사).
 *  · 머무는 동안 겹치는 보스가 이미 있으면(동시에 2마리) allowOverlap 없이는 OVERLAP으로 멈춰 화면이 한 번 더 묻는다.
 *  · 즉시 소환은 '예정' 행을 넣고 바로 activateDueBosses를 돌려 출현 처리(월드 피드·주인 길드 푸시)를 크론과 같은 경로로 탄다.
 *  · 예약 취소는 '예정'일 때만(출현 전엔 원정대가 생길 수 없다).
 */

const HOUR = 60 * 60 * 1000;
/** 예약은 30일 안쪽까지만 — 그 너머는 입력 실수로 본다. */
export const WORLD_BOSS_SCHEDULE_MAX_MS = 30 * 24 * HOUR;

export type AdminBossRow = {
  id: string;
  serverId: number;
  zoneId: number;
  zoneName: string;
  region: string;
  status: 'scheduled' | 'active' | 'left';
  stage: number;
  spawnAt: string;
  leaveAt: string;
  ownerName: string | null;
  traits: string[];
};
export type AdminZoneRow = {
  id: number;
  name: string;
  region: string;
  /** 세계지도 좌표(%) — 관리자 지도에서 게임 지도와 같은 자리에 찍는다. */
  mapX: number;
  mapY: number;
  ownerName: string | null;
  ownerEmblemUrl: string | null;
  ownerEmblemColor: string | null;
  busy: boolean;
};
export type AdminWorldBossBoard = { serverId: number; zones: AdminZoneRow[]; bosses: AdminBossRow[] }[];

/** 관리자 화면 데이터 — 서버마다 구역(주인·보스 유무)과 보스(출현 중·예정 전부 + 최근 종료 5). */
export async function adminWorldBossBoard(serverIds: number[]): Promise<AdminWorldBossBoard> {
  const out: AdminWorldBossBoard = [];
  for (const serverId of serverIds) {
    const [zones, bosses] = await Promise.all([
      db.execute(sql`
        select z.id, z.name, z.region::text as region, z.map_x, z.map_y, g.name as owner_name, g.emblem_url as owner_emblem, g.emblem_color as owner_color,
               exists (select 1 from world_bosses b where b.zone_id = z.id and b.status in ('scheduled', 'active')) as busy
          from zones z left join guilds g on g.id = z.owner_guild_id
         where z.server_id = ${serverId}
         order by z.region, z.name`) as unknown as Promise<{ id: number; name: string; region: string; map_x: number | string; map_y: number | string; owner_name: string | null; owner_emblem: string | null; owner_color: string | null; busy: boolean }[]>,
      db.execute(sql`
        (select b.id::text as id, b.zone_id, z.name as zone_name, b.region::text as region, b.status, b.stage, b.spawn_at, b.leave_at, g.name as owner_name, b.traits
           from world_bosses b join zones z on z.id = b.zone_id left join guilds g on g.id = z.owner_guild_id
          where b.server_id = ${serverId} and b.status in ('scheduled', 'active'))
        union all
        (select b.id::text as id, b.zone_id, z.name as zone_name, b.region::text as region, b.status, b.stage, b.spawn_at, b.leave_at, g.name as owner_name, b.traits
           from world_bosses b join zones z on z.id = b.zone_id left join guilds g on g.id = b.settled_guild_id
          where b.server_id = ${serverId} and b.status = 'left'
          order by b.leave_at desc limit 5)
        order by spawn_at desc`) as unknown as Promise<{ id: string; zone_id: number; zone_name: string; region: string; status: AdminBossRow['status']; stage: number; spawn_at: string | Date; leave_at: string | Date; owner_name: string | null; traits: unknown }[]>,
    ]);
    out.push({
      serverId,
      zones: zones.map((z) => ({ id: z.id, name: z.name, region: z.region, mapX: Number(z.map_x), mapY: Number(z.map_y), ownerName: z.owner_name, ownerEmblemUrl: z.owner_emblem, ownerEmblemColor: z.owner_color, busy: z.busy })),
      bosses: bosses.map((b) => ({
        id: b.id, serverId, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, status: b.status, stage: Number(b.stage),
        spawnAt: new Date(b.spawn_at).toISOString(), leaveAt: new Date(b.leave_at).toISOString(), ownerName: b.owner_name,
        traits: Array.isArray(b.traits) ? (b.traits as string[]) : [],
      })),
    });
  }
  return out;
}

export type SpawnOverlap = { id: string; zoneName: string; status: 'scheduled' | 'active'; spawnAt: string; leaveAt: string };
export type SpawnResult =
  | { ok: true; bossId: string; status: 'scheduled' | 'active'; zoneName: string; spawnAt: string; leaveAt: string }
  | { ok: false; code: 'ZONE_NOT_FOUND' | 'ZONE_BUSY' | 'PAST' | 'TOO_FAR' }
  | { ok: false; code: 'OVERLAP'; overlapping: SpawnOverlap[] };

export async function spawnWorldBossByAdmin(input: {
  serverId: number;
  zoneId: number;
  /** null = 즉시. */
  spawnAt: Date | null;
  adminUserId: string;
  allowOverlap: boolean;
}): Promise<SpawnResult> {
  const now = new Date();
  // 즉시는 1초 전으로 적어 activateDueBosses(spawn_at <= now())가 바로 집는다.
  const spawnAt = input.spawnAt ?? new Date(now.getTime() - 1000);
  if (input.spawnAt && input.spawnAt.getTime() < now.getTime() - 60_000) return { ok: false, code: 'PAST' };
  if (spawnAt.getTime() > now.getTime() + WORLD_BOSS_SCHEDULE_MAX_MS) return { ok: false, code: 'TOO_FAR' };
  const leaveAt = new Date(spawnAt.getTime() + WORLD_BOSS_STAY_MS);

  const result = await db.transaction(async (tx): Promise<SpawnResult> => {
    // 구역 행 잠금 — 같은 구역에 동시에 두 번 소환하는 경쟁을 직렬화한다.
    const [zone] = (await tx.execute(sql`
      select z.id, z.name, z.region::text as region, z.owner_guild_id::text as owner
        from zones z where z.id = ${input.zoneId} and z.server_id = ${input.serverId} for update`)) as unknown as { id: number; name: string; region: string; owner: string | null }[];
    if (!zone) return { ok: false, code: 'ZONE_NOT_FOUND' };
    const live = (await tx.execute(sql`
      select b.id::text as id, b.zone_id, z.name as zone_name, b.status, b.spawn_at, b.leave_at
        from world_bosses b join zones z on z.id = b.zone_id
       where b.server_id = ${input.serverId} and b.status in ('scheduled', 'active')
         and b.spawn_at < ${leaveAt.toISOString()}::timestamptz and b.leave_at > ${spawnAt.toISOString()}::timestamptz
       order by b.spawn_at`)) as unknown as { id: string; zone_id: number; zone_name: string; status: 'scheduled' | 'active'; spawn_at: string | Date; leave_at: string | Date }[];
    if (live.some((b) => b.zone_id === input.zoneId)) return { ok: false, code: 'ZONE_BUSY' };
    if (live.length > 0 && !input.allowOverlap) {
      return {
        ok: false,
        code: 'OVERLAP',
        overlapping: live.map((b) => ({ id: b.id, zoneName: b.zone_name, status: b.status, spawnAt: new Date(b.spawn_at).toISOString(), leaveAt: new Date(b.leave_at).toISOString() })),
      };
    }
    // 특성(0~2개)과 페이즈별 약점은 소환 때 고정(§3) — 약점 수는 특성을 따른다.
    const traits = drawWorldBossTraits(cryptoRand);
    const weak = await drawWeakForNewBoss(tx, worldBossWeakPerSlot(traits));
    const [ins] = (await tx.execute(sql`
      insert into world_bosses (server_id, zone_id, region, kst_day, spawn_at, leave_at, status, spawn_owner_guild_id, weak, traits)
      values (${input.serverId}, ${zone.id}, ${zone.region}, ${kstDateString(spawnAt)}::date, ${spawnAt.toISOString()}, ${leaveAt.toISOString()}, 'scheduled',
              ${zone.owner}::bigint, ${JSON.stringify(weak)}::jsonb, ${JSON.stringify(traits)}::jsonb)
      returning id::text as id`)) as unknown as { id: string }[];
    await tx.insert(adminActions).values({
      adminUserId: input.adminUserId,
      action: 'world_boss_spawn',
      targetType: 'world_boss',
      targetId: ins!.id,
      payload: { serverId: input.serverId, zoneId: zone.id, zoneName: zone.name, immediate: !input.spawnAt, spawnAt: spawnAt.toISOString(), leaveAt: leaveAt.toISOString(), overlapped: live.length, traits },
    });
    return { ok: true, bossId: ins!.id, status: 'scheduled', zoneName: zone.name, spawnAt: spawnAt.toISOString(), leaveAt: leaveAt.toISOString() };
  });
  if (result.ok && !input.spawnAt) {
    // 즉시 소환 — 출현 처리(월드 피드·푸시)는 크론과 같은 함수로. 실패해도 다음 크론 틱(5분)이 집는다.
    await activateDueBosses(input.serverId).catch((e) => console.warn('[world-boss] admin immediate activate failed', result.bossId, e));
    return { ...result, status: 'active' };
  }
  return result;
}

/** 예약 취소 — '예정'일 때만 행을 지운다(출현 전엔 원정대·약점 공개가 없다). 지운 행이 없으면 false. */
export async function cancelScheduledWorldBoss(input: { serverId: number; bossId: string; adminUserId: string }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      delete from world_bosses where id = ${input.bossId}::bigint and server_id = ${input.serverId} and status = 'scheduled'
      returning id::text as id, zone_id, spawn_at`)) as unknown as { id: string; zone_id: number; spawn_at: string | Date }[];
    if (rows.length === 0) return false;
    await tx.insert(adminActions).values({
      adminUserId: input.adminUserId,
      action: 'world_boss_cancel',
      targetType: 'world_boss',
      targetId: rows[0]!.id,
      payload: { serverId: input.serverId, zoneId: rows[0]!.zone_id, spawnAt: new Date(rows[0]!.spawn_at).toISOString() },
    });
    return true;
  });
}
