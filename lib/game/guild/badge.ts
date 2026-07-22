import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/** 닉네임 옆/아래 표시용 길드 요약(문양·이름·집행관 구역/지역). 길드 미소속이면 null. */
export type GuildBrief = {
  emblemUrl: string | null;
  name: string;
  executorZone: string | null;
  executorZoneRegion: string | null;
};

/** 한 유저의 길드 brief(미소속 null). executorZone/Region: 그 유저가 집행관인 구역명·지역(없으면 null, 1유저 1집행관). */
export async function getUserGuildBrief(userId: string, serverId: number): Promise<GuildBrief | null> {
  const rows = (await db.execute(sql`
    select g.name, g.emblem_url as emblem_url,
           z.name as executor_zone, z.region::text as executor_zone_region
    from guild_members gm
    join guilds g on g.id = gm.guild_id
    left join zones z on z.executor_user_id = gm.user_id and z.server_id = gm.server_id
    where gm.user_id = ${userId}::uuid and gm.server_id = ${serverId}
    limit 1
  `)) as unknown as {
    name: string;
    emblem_url: string | null;
    executor_zone: string | null;
    executor_zone_region: string | null;
  }[];
  const r = rows[0];
  return r
    ? {
        name: r.name,
        emblemUrl: r.emblem_url,
        executorZone: r.executor_zone,
        executorZoneRegion: r.executor_zone_region,
      }
    : null;
}

/** 여러 유저의 길드 brief 일괄 조회 → userId별 Map(미소속은 키 없음). 랭킹·레이드·친구 등 목록용. */
export async function getGuildBriefsByUsers(userIds: string[], serverId: number): Promise<Map<string, GuildBrief>> {
  if (userIds.length === 0) return new Map();
  // 집행관 구역 포함(2026-07-22) — 헤더·채팅 등 목록 화면에서도 집행관을 노출한다.
  // zones.executor_user_id는 1유저 1구역이라 조인이 행을 늘리지 않는다.
  const rows = (await db.execute(sql`
    select gm.user_id::text as uid, g.name, g.emblem_url as emblem_url,
           z.name as executor_zone, z.region::text as executor_zone_region
    from guild_members gm
    join guilds g on g.id = gm.guild_id
    left join zones z on z.executor_user_id = gm.user_id and z.server_id = gm.server_id
    where gm.user_id in ${userIds} and gm.server_id = ${serverId}
  `)) as unknown as {
    uid: string;
    name: string;
    emblem_url: string | null;
    executor_zone: string | null;
    executor_zone_region: string | null;
  }[];
  const m = new Map<string, GuildBrief>();
  for (const r of rows)
    m.set(r.uid, {
      name: r.name,
      emblemUrl: r.emblem_url,
      executorZone: r.executor_zone,
      executorZoneRegion: r.executor_zone_region,
    });
  return m;
}
