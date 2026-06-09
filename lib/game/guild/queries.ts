import 'server-only';

import { desc, eq, ilike, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';

import { guildCapacity } from './balance';

/** 내 길드 소속(1유저 1길드). 미소속이면 null. */
export async function getMyMembership(userId: string) {
  const [m] = await db
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  return m ?? null;
}

/** 길드 기본 정보 + 현재 인원/수용. */
export async function getGuild(guildId: bigint) {
  const [g] = await db.select().from(guilds).where(eq(guilds.id, guildId)).limit(1);
  if (!g) return null;
  const [cnt] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return { ...g, memberCount: cnt?.n ?? 0, capacity: guildCapacity(g.level) };
}

/** 길드 검색(이름 부분일치) — 가입 브라우즈용. 인원/수용 포함. */
export async function searchGuilds(q: string) {
  const term = q.trim();
  if (!term) return [];
  return db
    .select({
      id: guilds.id,
      name: guilds.name,
      level: guilds.level,
      emblemUrl: guilds.emblemUrl,
      memberCount: sql<number>`(select count(*)::int from guild_members gm where gm.guild_id = ${guilds.id})`,
    })
    .from(guilds)
    .where(ilike(guilds.name, `%${term}%`))
    .limit(20);
}

/** 길드원 목록 — 기여도 내림차순(무임승차 판단·표시용). */
export async function getGuildMembers(guildId: bigint) {
  return db
    .select({
      userId: guildMembers.userId,
      role: guildMembers.role,
      contributionPoints: guildMembers.contributionPoints,
      joinedAt: guildMembers.joinedAt,
      nickname: profiles.nickname,
    })
    .from(guildMembers)
    .innerJoin(profiles, eq(profiles.id, guildMembers.userId))
    .where(eq(guildMembers.guildId, guildId))
    .orderBy(desc(guildMembers.contributionPoints));
}
