import 'server-only';

import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { characters } from '@/lib/db/schema/server';
import {
  guilds,
  guildMembers,
  zones,
  conquestBattles,
  guildJoinRequests,
  zoneAdjacency,
} from '@/lib/db/schema/guild';
import { profiles } from '@/lib/db/schema/profiles';
import { userEquipment, catalogItems } from '@/lib/db/schema/equipment';
import { userProfiles } from '@/lib/db/schema/avatar';
import { leaderboardRanks } from '@/lib/db/schema/leaderboard';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';

import { kstDateString } from '@/lib/kst';

import { guildCapacity } from './balance';
import type { Region } from './region-meta';
import { nextBattleKstDay, isConquestLocked } from './conquest/schedule';

type DeployBoardMember = {
  uid: string;
  nickname: string;
  mrole: 'leader' | 'vice' | 'member';
  dep_zone_id: number | null;
  dep_zone_name: string | null;
  dep_role: 'attack' | 'defend' | null;
  exec_zone_id: number | null;
  exec_zone_name: string | null;
};

/** 내 길드 소속(1유저 1길드) + 기여도·일일 기부 카운터. 미소속이면 null. */
export async function getMyMembership(userId: string, serverId: number) {
  const [m] = await db
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      contributionPoints: guildMembers.contributionPoints,
      dailyDonationCount: guildMembers.dailyDonationCount,
      lastDonationKstDay: guildMembers.lastDonationKstDay,
    })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
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
      nickname: characters.nickname,
      createdAt: guildJoinRequests.createdAt,
    })
    .from(guildJoinRequests)
    .innerJoin(
      characters,
      and(
        eq(characters.userId, guildJoinRequests.userId),
        eq(characters.serverId, guildJoinRequests.serverId),
      ),
    )
    .where(eq(guildJoinRequests.guildId, guildId))
    .orderBy(guildJoinRequests.createdAt);
}

/** 내 가입 신청(있으면 신청 길드 id) — 미가입 첫화면 '신청됨' 표시. */
export async function getMyJoinRequest(userId: string, serverId: number): Promise<bigint | null> {
  const [r] = await db
    .select({ guildId: guildJoinRequests.guildId })
    .from(guildJoinRequests)
    .where(and(eq(guildJoinRequests.userId, userId), eq(guildJoinRequests.serverId, serverId)))
    .limit(1);
  return r?.guildId ?? null;
}

/**
 * 길드별 전투력 합(길드원 전투력 합, BALANCE §3) — guildId→합산 CP. JS 공식(pieceCombatPower)이라
 * SQL 정렬 불가 → 멤버·장비 로드 후 합산. ⚠ 길드 수가 매우 커지면 비정규화 캐시 고려(현재 소규모라 라이브).
 */
type GuildMemberStat = { combat: number; memberCount: number };
/**
 * 길드별 전투력 합 + 멤버 수 — guild_members를 길드별 GROUP BY로 한 번 스캔해 둘 다 산출.
 * memberCount를 길드마다 상관 서브쿼리로 N번 세던 것을 이 집계 1회로 흡수(최적화, 2026-07-07).
 * 전투력 = 멤버 combat 스냅샷(leaderboard_ranks, cron 사전계산) 합 — 라이브 장비 스캔 제거(감사 S1).
 * 멤버 수는 count(distinct userId)로 세어 left join 중복행에 영향받지 않음. 스냅샷 미존재 멤버는 0.
 */
async function guildMemberStats(serverId: number, guildIds: bigint[]): Promise<Map<string, GuildMemberStat>> {
  const byGuild = new Map<string, GuildMemberStat>();
  if (guildIds.length === 0) return byGuild;
  for (const g of guildIds) byGuild.set(g.toString(), { combat: 0, memberCount: 0 }); // 0명 길드도 포함
  const rows = await db
    .select({
      gid: guildMembers.guildId,
      cp: sql<number>`coalesce(sum(${leaderboardRanks.value}), 0)::bigint`,
      cnt: sql<number>`count(distinct ${guildMembers.userId})::int`,
    })
    .from(guildMembers)
    .leftJoin(
      leaderboardRanks,
      and(
        eq(leaderboardRanks.userId, guildMembers.userId),
        eq(leaderboardRanks.serverId, guildMembers.serverId),
        eq(leaderboardRanks.metric, 'combat'),
      ),
    )
    .where(and(eq(guildMembers.serverId, serverId), inArray(guildMembers.guildId, guildIds)))
    .groupBy(guildMembers.guildId);
  for (const r of rows) byGuild.set(r.gid.toString(), { combat: Number(r.cp), memberCount: Number(r.cnt) });
  return byGuild;
}

/** 팝업 구역 칩용 최소 정보 — region은 지역색 표시 근거. */
type ZoneChip = { name: string; region: Region };

/**
 * 길드별 점령 구역 목록(이름+지역) — guildId→배열(zone.id 오름차순). 여러 길드 1쿼리(N+1 방지).
 * 리스트 카드의 점령 수 배지 + 상세 팝업의 구역 칩(지역색) 공용.
 */
async function guildZoneChips(serverId: number, guildIds: bigint[]): Promise<Map<string, ZoneChip[]>> {
  const byGuild = new Map<string, ZoneChip[]>();
  if (guildIds.length === 0) return byGuild;
  const rows = await db
    .select({ ownerGuildId: zones.ownerGuildId, name: zones.name, region: zones.region })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), inArray(zones.ownerGuildId, guildIds)))
    .orderBy(zones.id);
  for (const r of rows) {
    if (r.ownerGuildId == null) continue;
    const key = r.ownerGuildId.toString();
    const chip = { name: r.name, region: r.region };
    const arr = byGuild.get(key);
    if (arr) arr.push(chip);
    else byGuild.set(key, [chip]);
  }
  return byGuild;
}

/** 랭킹 정렬 기준 — 전투력(길드원 전투력 합) | 레벨 | 점령지(구역 수). 랭킹은 서버 전체 대상이므로
 *  정렬은 반드시 전 길드 계산 후 slice 앞에서 수행(상위 N 재정렬은 다른 기준 1위를 누락시킴). */
export type GuildRankSort = 'combat' | 'level' | 'zones';

// 정렬 기준별 비교자 — 동률은 전투력 → 레벨 순으로 안정화(순위 흔들림 방지).
const RANKING_COMPARATORS: Record<
  GuildRankSort,
  (a: { combat: number; level: number; zones: unknown[] }, b: { combat: number; level: number; zones: unknown[] }) => number
> = {
  combat: (a, b) => b.combat - a.combat || b.level - a.level,
  level: (a, b) => b.level - a.level || b.combat - a.combat,
  zones: (a, b) => b.zones.length - a.zones.length || b.combat - a.combat || b.level - a.level,
};

/** 길드 랭킹 — 서버 전체 길드를 sort 기준으로 정렬 후 상위 limit. combat 필드 포함. 미가입 첫화면 랭킹 탭. */
/** 길드장 닉네임 스칼라 서브쿼리 — 카드/팝업 노출용(2026-07-13). 길드장 부재(이론상 없음)면 null. */
const leaderNicknameSql = sql<string | null>`(
  select c.nickname from guild_members gm
  join characters c on c.user_id = gm.user_id and c.server_id = gm.server_id
  where gm.guild_id = ${guilds.id} and gm.role = 'leader'
  limit 1
)`;

/**
 * 랭킹 base 계산 — 서버 전체 길드 + 멤버 stats(전투력·인원) + 점령 zones를 한 번에 산출(정렬 전).
 * 정렬 comparator는 이 결과에 in-memory로 적용하므로, 여러 지표 정렬을 원해도 DB 비용은 1회.
 */
async function buildGuildRankingBase(serverId: number) {
  const rows = await db
    .select({
      id: guilds.id,
      name: guilds.name,
      level: guilds.level,
      emblemUrl: guilds.emblemUrl,
      emblemColor: guilds.emblemColor,
      intro: guilds.intro,
      joinPolicy: guilds.joinPolicy,
      // URL 원문은 비길드원에 미전송(보안) — 배지용 boolean만. 링크는 GuildHome(길드원)에서만.
      hasOpenchat: sql<boolean>`(${guilds.openchatUrl} is not null)`,
      leaderNickname: leaderNicknameSql,
    })
    .from(guilds)
    .where(eq(guilds.serverId, serverId));
  const ids = rows.map((r) => r.id);
  const [stats, zoneChips] = await Promise.all([
    guildMemberStats(serverId, ids),
    guildZoneChips(serverId, ids),
  ]);
  return rows.map((r) => {
    const s = stats.get(r.id.toString());
    return {
      ...r,
      memberCount: s?.memberCount ?? 0,
      combat: s?.combat ?? 0,
      zones: zoneChips.get(r.id.toString()) ?? [],
    };
  });
}

export async function getGuildRanking(serverId: number, limit = 50, sort: GuildRankSort = 'combat') {
  const base = await buildGuildRankingBase(serverId);
  return base.sort(RANKING_COMPARATORS[sort]).slice(0, limit);
}

/**
 * 지표별 랭킹 3종(레벨/전투력/점령지)을 DB 1회 비용으로 반환 — 무소속 browse 랭킹 탭의
 * 클라 필터 전환용. 각 리스트는 해당 지표 기준 진짜 top-N(클라 재정렬과 달리 상위권 누락 없음).
 * ⚠ 정렬은 배열을 변형하므로 지표마다 base 사본([...base])을 정렬한다.
 */
export async function getGuildRankingsMulti(serverId: number, limit = 50) {
  const base = await buildGuildRankingBase(serverId);
  const bySort = (sort: GuildRankSort) => [...base].sort(RANKING_COMPARATORS[sort]).slice(0, limit);
  return { level: bySort('level'), combat: bySort('combat'), zones: bySort('zones') };
}

/** 길드 검색(이름 부분일치) — 가입 브라우즈용. combat(전투력 합) 포함.
 *  검색어 없으면 랜덤 10개(검색 전 기본 추천 노출). */
export async function searchGuilds(serverId: number, q: string) {
  const term = q.trim().slice(0, 30);
  // LIKE 와일드카드 리터럴화(풀스캔 유발 방지, 기본 escape=\).
  const safeTerm = term.replace(/[\\%_]/g, '\\$&');
  const sel = {
    id: guilds.id,
    name: guilds.name,
    level: guilds.level,
    emblemUrl: guilds.emblemUrl,
    emblemColor: guilds.emblemColor,
    intro: guilds.intro,
    joinPolicy: guilds.joinPolicy,
    // URL 원문은 비길드원에 미전송(보안) — 배지용 boolean만.
    hasOpenchat: sql<boolean>`(${guilds.openchatUrl} is not null)`,
    leaderNickname: leaderNicknameSql,
  } as const;
  const rows = term
    ? await db
        .select(sel)
        .from(guilds)
        .where(and(eq(guilds.serverId, serverId), ilike(guilds.name, `%${safeTerm}%`)))
        .limit(20)
    : await db
        .select(sel)
        .from(guilds)
        .where(eq(guilds.serverId, serverId))
        .orderBy(sql`random()`)
        .limit(10);
  const ids = rows.map((r) => r.id);
  const [stats, zoneChips] = await Promise.all([
    guildMemberStats(serverId, ids),
    guildZoneChips(serverId, ids),
  ]);
  return rows.map((r) => {
    const s = stats.get(r.id.toString());
    return {
      ...r,
      memberCount: s?.memberCount ?? 0,
      combat: s?.combat ?? 0,
      zones: zoneChips.get(r.id.toString()) ?? [],
    };
  });
}

/** 길드 1건 요약(이름 정확일치) — 세계지도 연대기에서 길드명 클릭 팝업용. 없으면 null. */
export async function getGuildSummaryByName(serverId: number, name: string) {
  const [g] = await db
    .select({
      id: guilds.id,
      name: guilds.name,
      level: guilds.level,
      emblemUrl: guilds.emblemUrl,
      intro: guilds.intro,
      joinPolicy: guilds.joinPolicy,
      leaderUserId: guilds.leaderUserId,
    })
    .from(guilds)
    .where(and(eq(guilds.serverId, serverId), eq(guilds.name, name)))
    .limit(1);
  if (!g) return null;
  const [stats, zoneRows, [leader]] = await Promise.all([
    guildMemberStats(serverId, [g.id]),
    // 점령 구역 목록 — 길드 목록 팝업과 동일 정보(세계지도 팝업 정보 격차 해소, 2026-07-06).
    db
      .select({ name: zones.name, region: zones.region })
      .from(zones)
      .where(and(eq(zones.serverId, serverId), eq(zones.ownerGuildId, g.id)))
      .orderBy(zones.id),
    // 길드장 닉/코드(2026-07-21) — 팝업에서 프로필 링크.
    db
      .select({ nickname: characters.nickname, code: profiles.publicCode })
      .from(characters)
      .innerJoin(profiles, eq(profiles.id, characters.userId))
      .where(and(eq(characters.userId, g.leaderUserId), eq(characters.serverId, serverId)))
      .limit(1),
  ]);
  const s = stats.get(g.id.toString());
  return {
    name: g.name,
    level: g.level,
    emblemUrl: g.emblemUrl,
    intro: g.intro,
    memberCount: s?.memberCount ?? 0,
    combat: s?.combat ?? 0,
    joinPolicy: g.joinPolicy,
    leaderNickname: leader?.nickname ?? null,
    leaderCode: leader?.code ?? null,
    zones: zoneRows.map((z) => ({ name: z.name, region: z.region })),
  };
}

/** 월드맵 50구역 + 소유 길드명/집행관 닉(중립=null). 읽기전용 뷰어용. */
export async function getWorldmapZones(serverId: number) {
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
      ownerEmblemColor: ownerGuild.emblemColor,
      executorUserId: zones.executorUserId,
      executorNickname: characters.nickname,
      // 집행관 프로필 링크용(2026-07-21) — 구역 팝업에서 클릭 → /u/[code] 이동.
      executorCode: profiles.publicCode,
      taxDiamond: zones.taxDiamond,
      taxBonus: zones.taxBonus, // 독점 세금 보너스 배율(B안) — 세율 표시용
      lastTaxCollectedAt: zones.lastTaxCollectedAt,
      capturedAt: zones.capturedAt, // 수금 타이머(습득 72h) 계산용
      // 거주 인원 — 이 구역을 거주지로 둔 유저 수(상관 서브쿼리, executor 조인과 별개 스코프).
      residentCount: sql<number>`(select count(*)::int from characters rc where rc.residence_zone_id = ${zones.id})`,
    })
    .from(zones)
    .leftJoin(ownerGuild, eq(ownerGuild.id, zones.ownerGuildId))
    .leftJoin(
      characters,
      and(eq(characters.userId, zones.executorUserId), eq(characters.serverId, zones.serverId)),
    )
    .leftJoin(profiles, eq(profiles.id, zones.executorUserId))
    .where(eq(zones.serverId, serverId))
    .orderBy(zones.id);
}

/** 구역 인접 간선(무방향, 정규형 a<b) — 지도 연결선·인접 공격 규칙 표시용. */
export async function getZoneAdjacency(serverId: number): Promise<{ a: number; b: number }[]> {
  const rows = await db
    .select({ a: zoneAdjacency.zoneA, b: zoneAdjacency.zoneB })
    .from(zoneAdjacency)
    .innerJoin(zones, and(eq(zones.id, zoneAdjacency.zoneA), eq(zones.serverId, serverId)));
  return rows;
}

/**
 * 길드가 공격 가능한 구역 id 목록 — 소유 구역에 인접한 비소유 구역.
 *  소유 구역이 0개면 모든 구역 공격 가능(첫 상륙 자유). 배치 UI 필터용(서버 검증과 동일 규칙).
 */
export async function getAttackableZoneIds(guildId: bigint): Promise<number[]> {
  const owned = await db.select({ id: zones.id }).from(zones).where(eq(zones.ownerGuildId, guildId));
  const [g] = await db.select({ serverId: guilds.serverId }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
  const serverId = g?.serverId ?? 1;
  if (owned.length === 0) {
    const all = await db.select({ id: zones.id }).from(zones).where(eq(zones.serverId, serverId));
    return all.map((z) => z.id); // 첫 상륙 자유
  }
  const ownedIds = owned.map((o) => o.id);
  const ownedSet = new Set(ownedIds);
  const adj = await db
    .select({ a: zoneAdjacency.zoneA, b: zoneAdjacency.zoneB })
    .from(zoneAdjacency)
    .where(or(inArray(zoneAdjacency.zoneA, ownedIds), inArray(zoneAdjacency.zoneB, ownedIds)));
  const set = new Set<number>();
  for (const e of adj) {
    if (ownedSet.has(e.a)) set.add(e.b);
    if (ownedSet.has(e.b)) set.add(e.a);
  }
  // 중립 구역(소유 없음)은 인접 무관 공격 가능(B안 — 서버 assertAttackable과 동일 규칙).
  const neutral = await db
    .select({ id: zones.id })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), isNull(zones.ownerGuildId)));
  for (const z of neutral) set.add(z.id);
  for (const id of ownedIds) set.delete(id); // 자기 소유는 공격 대상 아님
  return [...set];
}

/** 구역의 최근 점령 전투 id(없으면 null) — 전투 기록 페이지 진입용. 공개된(published) 전투만. */
export async function getZoneLatestBattleId(zoneId: number) {
  const [b] = await db
    .select({ id: conquestBattles.id })
    .from(conquestBattles)
    // 23:00 정산분은 24:00 공개 전까지 비노출(published_at IS NULL) — 지연 공개(§5.8).
    .where(and(eq(conquestBattles.zoneId, zoneId), isNotNull(conquestBattles.publishedAt)))
    .orderBy(desc(conquestBattles.battleKstDay))
    .limit(1);
  return b?.id ?? null;
}

/** 점령 전투 1건(id) — 상세 전투 기록 페이지용. 구역/지역/승자(문양) + finale jsonb. 공개 읽기. */
export async function getConquestBattleById(id: bigint) {
  const [b] = await db
    .select({
      id: conquestBattles.id,
      serverId: conquestBattles.serverId,
      battleKstDay: conquestBattles.battleKstDay,
      zoneId: conquestBattles.zoneId,
      zoneName: zones.name,
      zoneRegion: zones.region,
      winnerGuildId: conquestBattles.winnerGuildId,
      winnerName: guilds.name,
      winnerEmblemUrl: guilds.emblemUrl,
      finale: conquestBattles.finale,
    })
    .from(conquestBattles)
    .innerJoin(zones, eq(zones.id, conquestBattles.zoneId))
    .leftJoin(guilds, eq(guilds.id, conquestBattles.winnerGuildId))
    // 공개 전(published_at IS NULL) 전투는 직접 id 접근으로도 비노출(지연 공개·§5.8).
    .where(and(eq(conquestBattles.id, id), isNotNull(conquestBattles.publishedAt)))
    .limit(1);
  return b ?? null;
}

/** 점령전 배치 보드(임원 배치/전원 조회) — 길드원별 현재 배치·집행관 + 구역 목록(픽커). */
export async function getDeployBoard(guildId: bigint) {
  // 잠금 시간(23:00~23:59)엔 다음 전투(빈 보드) 대신 진행 중(오늘) 전투 배치를 그대로 노출.
  // 클라(DeployBoard)는 이미 자체 시계로 '진행 중·읽기전용'을 표시 → 여기선 데이터만 맞춤.
  const battleKstDay = isConquestLocked() ? kstDateString() : nextBattleKstDay();
  // 길드의 서버 — 존 목록·전투력 스코프 기준(길드는 서버에 묶임).
  const [g] = await db.select({ serverId: guilds.serverId }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
  const gServerId = g?.serverId ?? 1;
  const members = (await db.execute(sql`
    select gm.user_id::text uid, c.nickname, gm.role::text mrole,
           d.zone_id dep_zone_id, dz.name dep_zone_name, d.role::text dep_role,
           ez.id exec_zone_id, ez.name exec_zone_name
    from guild_members gm
    join characters c on c.user_id = gm.user_id and c.server_id = gm.server_id
    left join guild_battle_deployments d on d.user_id = gm.user_id and d.server_id = gm.server_id and d.battle_kst_day = ${battleKstDay}
    left join zones dz on dz.id = d.zone_id
    left join zones ez on ez.executor_user_id = gm.user_id and ez.server_id = gm.server_id
    where gm.guild_id = ${guildId}
    order by case gm.role when 'leader' then 0 when 'vice' then 1 else 2 end, c.nickname
  `)) as unknown as DeployBoardMember[];

  const zoneRows = await db
    .select({
      id: zones.id,
      name: zones.name,
      region: zones.region,
      mapX: zones.mapX,
      mapY: zones.mapY,
      ownerGuildId: zones.ownerGuildId,
      ownerEmblemUrl: guilds.emblemUrl,
    })
    .from(zones)
    .leftJoin(guilds, eq(guilds.id, zones.ownerGuildId))
    .where(eq(zones.serverId, gServerId))
    .orderBy(zones.id);

  // 길드원 전투력 — 보유 장비 1쿼리 → combatPowerFromOwned. userId→전투력.
  const ids = members.map((m) => m.uid);
  const combat: Record<string, number> = {};
  if (ids.length) {
    const eqRows = await db
      .select({
        uid: userEquipment.userId,
        cid: userEquipment.catalogItemId,
        el: userEquipment.enhanceLevel,
        tl: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .where(and(eq(userEquipment.serverId, gServerId), inArray(userEquipment.userId, ids)));
    const owned = new Map<string, { catalogItemId: number; enhanceLevel: number; transcendLevel: number }[]>();
    for (const r of eqRows) {
      (owned.get(r.uid) ?? owned.set(r.uid, []).get(r.uid)!).push({
        catalogItemId: r.cid,
        enhanceLevel: r.el,
        transcendLevel: r.tl,
      });
    }
    for (const id of ids) combat[id] = combatPowerFromOwned(owned.get(id) ?? []);
  }

  return { battleKstDay, members, zones: zoneRows, combat };
}

type EquippedIcon = {
  slot: 'weapon' | 'armor' | 'accessory';
  code: string;
  enhance: number;
  /** 초월 등급 — CSS 보더 색(rarityBorderStyle)용. */
  transcendLevel: number;
  catalogItemId: number;
  /** 해방 등수(강화랭킹 1~3위) — TranscendSprite 후광. 미해방=null. */
  championRank: number | null;
};

/**
 * 길드원 리치 목록 — 아바타·장착 3종·전투력/최고강화/합산강화/기여도. 정렬은 클라에서.
 * 멤버 기본(아바타) 1쿼리 + 보유 장비 1쿼리(전 멤버) → 앱에서 메트릭·장착 산출.
 */
export async function getGuildMembersRich(guildId: bigint) {
  const base = await db
    .select({
      userId: guildMembers.userId,
      serverId: guildMembers.serverId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      role: guildMembers.role,
      contribution: guildMembers.contributionPoints,
      lastSeenAt: characters.lastSeenAt,
      // 아바타는 항상 정면(south) — 8방향 미사용.
      avatar: sql<string | null>`${userProfiles.rotations} ->> 'south'`,
    })
    .from(guildMembers)
    .innerJoin(profiles, eq(profiles.id, guildMembers.userId))
    .innerJoin(
      characters,
      and(eq(characters.userId, guildMembers.userId), eq(characters.serverId, guildMembers.serverId)),
    )
    .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
    .where(eq(guildMembers.guildId, guildId));

  const ids = base.map((b) => b.userId);
  // 길드는 서버 종속 → 전 멤버 동일 serverId. 장비를 그 서버로 스코프(멀티서버 유저 타서버 장비 합산 방지).
  const serverId = base[0]?.serverId;
  const eqRows =
    ids.length && serverId != null
      ? await db
          .select({
            uid: userEquipment.userId,
            cid: userEquipment.catalogItemId,
            el: userEquipment.enhanceLevel,
            tl: userEquipment.transcendLevel,
            eslot: userEquipment.equippedSlot,
            code: catalogItems.code,
            slot: catalogItems.slot,
          })
          .from(userEquipment)
          .innerJoin(catalogItems, eq(catalogItems.id, userEquipment.catalogItemId))
          .where(and(eq(userEquipment.serverId, serverId), inArray(userEquipment.userId, ids)))
      : [];

  // 해방 등수(강화랭킹 1~3위) — 길드 전 멤버의 '장착' 아이템에 대해 1쿼리 배치(N+1 금지).
  //   ahead = 같은 catalog_item에서 자신보다 상위(레벨↑ / 동률·먼저달성 / 동률·동시각·user_id↓) 수.
  //   ahead<3 → 해방(rank=ahead+1). 타임아웃 시 빈 맵(후광만 생략, 페이지 영향 X). cf. liberatedItemRanks.
  const libRank = new Map<string, Map<number, number>>();
  if (ids.length && serverId != null) {
    try {
      const libRows = (await withTimeout(
        db.execute(sql`
          select uc.user_id as uid, uc.catalog_item_id as cid,
            (select count(*) from user_equipment o
             where o.catalog_item_id = uc.catalog_item_id and o.server_id = ${serverId}
               and (o.max_enhance_level > uc.max_enhance_level
                 or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at < uc.max_enhance_reached_at)
                 or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at = uc.max_enhance_reached_at and o.user_id < uc.user_id)))::int as ahead
          from user_equipment uc
          where uc.server_id = ${serverId} and uc.equipped_slot is not null and uc.max_enhance_level > 0
            and uc.user_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
        `),
        3000,
        'guildLiberatedRanks',
      )) as unknown as { uid: string; cid: number; ahead: number }[];
      for (const r of libRows) {
        const ahead = Number(r.ahead);
        if (ahead < 3) {
          const mm = libRank.get(r.uid) ?? libRank.set(r.uid, new Map()).get(r.uid)!;
          mm.set(Number(r.cid), ahead + 1);
        }
      }
    } catch {
      // 빈 맵 유지 — 후광만 생략.
    }
  }

  // uid별 보유 묶기 → 전투력/최고/합산/장착 3종.
  const owned = new Map<string, { catalogItemId: number; enhanceLevel: number; transcendLevel: number }[]>();
  const equipped = new Map<string, EquippedIcon[]>();
  for (const r of eqRows) {
    (owned.get(r.uid) ?? owned.set(r.uid, []).get(r.uid)!).push({
      catalogItemId: r.cid,
      enhanceLevel: r.el,
      transcendLevel: r.tl,
    });
    if (r.eslot) {
      (equipped.get(r.uid) ?? equipped.set(r.uid, []).get(r.uid)!).push({
        slot: r.eslot,
        code: r.code,
        enhance: r.el,
        transcendLevel: r.tl,
        catalogItemId: r.cid,
        championRank: libRank.get(r.uid)?.get(r.cid) ?? null,
      });
    }
  }

  return base.map((b) => {
    const own = owned.get(b.userId) ?? [];
    return {
      userId: b.userId,
      nickname: b.nickname,
      publicCode: b.publicCode,
      role: b.role,
      avatar: b.avatar,
      lastSeenAt: b.lastSeenAt ? b.lastSeenAt.toISOString() : null,
      contribution: Number(b.contribution),
      combat: combatPowerFromOwned(own),
      maxEnhance: own.reduce((mx, o) => Math.max(mx, o.enhanceLevel), 0),
      totalEnhance: own.reduce((s, o) => s + o.enhanceLevel, 0),
      equipped: equipped.get(b.userId) ?? [],
    };
  });
}

/** 길드원 목록 — 기여도 내림차순(무임승차 판단·표시용). */
export async function getGuildMembers(guildId: bigint) {
  return db
    .select({
      userId: guildMembers.userId,
      role: guildMembers.role,
      contributionPoints: guildMembers.contributionPoints,
      joinedAt: guildMembers.joinedAt,
      nickname: characters.nickname,
    })
    .from(guildMembers)
    .innerJoin(
      characters,
      and(eq(characters.userId, guildMembers.userId), eq(characters.serverId, guildMembers.serverId)),
    )
    .where(eq(guildMembers.guildId, guildId))
    .orderBy(desc(guildMembers.contributionPoints));
}

