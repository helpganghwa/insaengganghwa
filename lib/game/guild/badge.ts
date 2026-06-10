import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/** 닉네임 옆/아래 표시용 길드 요약(문양·이름). 길드 미소속이면 null. */
export type GuildBrief = { emblemUrl: string | null; name: string };

/** 한 유저의 길드 brief(미소속 null). */
export async function getUserGuildBrief(userId: string): Promise<GuildBrief | null> {
  const rows = (await db.execute(sql`
    select g.name, g.emblem_url as emblem_url
    from guild_members gm
    join guilds g on g.id = gm.guild_id
    where gm.user_id = ${userId}::uuid
    limit 1
  `)) as unknown as { name: string; emblem_url: string | null }[];
  const r = rows[0];
  return r ? { name: r.name, emblemUrl: r.emblem_url } : null;
}

/** 여러 유저의 길드 brief 일괄 조회 → userId별 Map(미소속은 키 없음). 랭킹·레이드·친구 등 목록용. */
export async function getGuildBriefsByUsers(userIds: string[]): Promise<Map<string, GuildBrief>> {
  if (userIds.length === 0) return new Map();
  const rows = (await db.execute(sql`
    select gm.user_id::text as uid, g.name, g.emblem_url as emblem_url
    from guild_members gm
    join guilds g on g.id = gm.guild_id
    where gm.user_id in ${userIds}
  `)) as unknown as { uid: string; name: string; emblem_url: string | null }[];
  const m = new Map<string, GuildBrief>();
  for (const r of rows) m.set(r.uid, { name: r.name, emblemUrl: r.emblem_url });
  return m;
}
