import 'server-only';

import { desc, eq, ilike, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  guilds,
  guildMembers,
  zones,
  conquestBattles,
  guildJoinRequests,
} from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';

import { guildCapacity } from './balance';

/** 내 길드 소속(1유저 1길드) + 기여도·일일 기부 카운터. 미소속이면 null. */
export async function getMyMembership(userId: string) {
  const [m] = await db
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      contributionPoints: guildMembers.contributionPoints,
      dailyDonationCount: guildMembers.dailyDonationCount,
      lastDonationKstDay: guildMembers.lastDonationKstDay,
    })
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

/** 길드 가입 신청 목록(승인제) — 임원 UI용. 신청자 닉·신청시각. */
export async function getJoinRequests(guildId: bigint) {
  return db
    .select({
      userId: guildJoinRequests.userId,
      nickname: profiles.nickname,
      createdAt: guildJoinRequests.createdAt,
    })
    .from(guildJoinRequests)
    .innerJoin(profiles, eq(profiles.id, guildJoinRequests.userId))
    .where(eq(guildJoinRequests.guildId, guildId))
    .orderBy(guildJoinRequests.createdAt);
}

/** 내 가입 신청(있으면 신청 길드 id) — 미가입 첫화면 '신청됨' 표시. */
export async function getMyJoinRequest(userId: string): Promise<bigint | null> {
  const [r] = await db
    .select({ guildId: guildJoinRequests.guildId })
    .from(guildJoinRequests)
    .where(eq(guildJoinRequests.userId, userId))
    .limit(1);
  return r?.guildId ?? null;
}

/** 길드 랭킹 — 레벨↓·XP↓ 순. 미가입 첫화면 랭킹 탭. 문양·인원 포함. */
export async function getGuildRanking(limit = 50) {
  return db
    .select({
      id: guilds.id,
      name: guilds.name,
      level: guilds.level,
      emblemUrl: guilds.emblemUrl,
      emblemColor: guilds.emblemColor,
      memberCount: sql<number>`(select count(*)::int from guild_members gm where gm.guild_id = ${guilds.id})`,
    })
    .from(guilds)
    .orderBy(desc(guilds.level), desc(guilds.xp))
    .limit(limit);
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
      emblemColor: guilds.emblemColor,
      memberCount: sql<number>`(select count(*)::int from guild_members gm where gm.guild_id = ${guilds.id})`,
    })
    .from(guilds)
    .where(ilike(guilds.name, `%${term}%`))
    .limit(20);
}

/** 월드맵 50구역 + 소유 길드명/집행관 닉(중립=null). 읽기전용 뷰어용. */
export async function getWorldmapZones() {
  const ownerGuild = guilds;
  return db
    .select({
      id: zones.id,
      region: zones.region,
      name: zones.name,
      mapX: zones.mapX,
      mapY: zones.mapY,
      ownerGuildId: zones.ownerGuildId,
      ownerGuildName: ownerGuild.name,
      ownerEmblemUrl: ownerGuild.emblemUrl,
      executorUserId: zones.executorUserId,
      executorNickname: profiles.nickname,
      taxDiamond: zones.taxDiamond,
    })
    .from(zones)
    .leftJoin(ownerGuild, eq(ownerGuild.id, zones.ownerGuildId))
    .leftJoin(profiles, eq(profiles.id, zones.executorUserId))
    .orderBy(zones.id);
}

/** 구역의 최근 점령 전투(없으면 null) — 결과/리플레이용. finale jsonb 포함. */
export async function getZoneLatestBattle(zoneId: number) {
  const [b] = await db
    .select({
      battleKstDay: conquestBattles.battleKstDay,
      winnerGuildId: conquestBattles.winnerGuildId,
      winnerName: guilds.name,
      finale: conquestBattles.finale,
    })
    .from(conquestBattles)
    .leftJoin(guilds, eq(guilds.id, conquestBattles.winnerGuildId))
    .where(eq(conquestBattles.zoneId, zoneId))
    .orderBy(desc(conquestBattles.battleKstDay))
    .limit(1);
  return b ?? null;
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
