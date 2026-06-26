import 'server-only';

import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userEquipment } from '@/lib/db/schema/equipment';
import { leaderboardRanks } from '@/lib/db/schema/leaderboard';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';

/**
 * 랭킹 — BALANCE §3.3. **시즌제 없음·상시 누적·Top 100**. 읽기는 사전계산 스냅샷(leaderboard_ranks,
 * cron이 N분마다 재계산)에서 — 유저 수와 무관하게 인덱스 조회. 무거운 전 유저 집계는 snapshot.ts(cron).
 */
export type LeaderboardMetric = 'max' | 'sum' | 'combat' | 'raid' | 'melee';
export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  /** 불변 공개 코드 — /u 링크 식별자(닉 변경 무관). */
  publicCode: string;
  value: number;
  rank: number;
  /** 대표 프로필 이미지 URL(없으면 null) */
  profileImg?: string | null;
  /** 길드 문양 URL(미소속/생성중이면 null) — 닉네임 옆 노출용. */
  guildEmblemUrl?: string | null;
  /** 길드명(미소속이면 null) — 닉네임 아래 노출용. */
  guildName?: string | null;
};
const TOP = 100;
const TIMEOUT_MS = 3000;

/**
 * top entries에 대표 프로필 이미지 + 배경을 batch로 붙임(랭킹 쿼리와 분리).
 */
async function attachProfiles(serverId: number, entries: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  if (entries.length === 0) return entries;
  let rows: { userId: string; rotations: unknown; activeDirection: string | null }[];
  try {
    rows = await withTimeout(
      db
        .select({
          userId: characters.userId,
          rotations: userProfiles.rotations,
          activeDirection: userProfiles.activeDirection,
        })
        .from(characters)
        .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
        .where(
          and(eq(characters.serverId, serverId), inArray(characters.userId, entries.map((e) => e.userId))),
        ),
      3000,
      'leaderboard.profiles',
    );
  } catch {
    return entries.map((e) => ({ ...e, profileImg: null, guildEmblemUrl: null }));
  }
  const map = new Map(
    rows.map((r) => {
      const rot = r.rotations as Record<string, string> | null;
      const img = rot && r.activeDirection ? (rot[r.activeDirection] ?? null) : null;
      return [r.userId, img] as const;
    }),
  );
  let guildMap = new Map<string, { emblemUrl: string | null; name: string }>();
  try {
    guildMap = await getGuildBriefsByUsers(entries.map((e) => e.userId), serverId);
  } catch {
    // 무시 — 문양 없이 진행.
  }
  return entries.map((e) => ({
    ...e,
    profileImg: map.get(e.userId) ?? null,
    guildEmblemUrl: guildMap.get(e.userId)?.emblemUrl ?? null,
    guildName: guildMap.get(e.userId)?.name ?? null,
  }));
}

// ── 스냅샷 읽기(인덱스, 유저 수 무관) ──

/** Top-N — (server,metric,rank) 인덱스로 N행. nickname/publicCode는 조인(신선). */
async function snapshotTop(metric: LeaderboardMetric, serverId: number, n: number): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: leaderboardRanks.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: leaderboardRanks.value,
      rank: leaderboardRanks.rank,
    })
    .from(leaderboardRanks)
    .innerJoin(
      characters,
      and(eq(characters.userId, leaderboardRanks.userId), eq(characters.serverId, serverId)),
    )
    .innerJoin(profiles, eq(profiles.id, leaderboardRanks.userId))
    .where(and(eq(leaderboardRanks.serverId, serverId), eq(leaderboardRanks.metric, metric)))
    .orderBy(leaderboardRanks.rank)
    .limit(n);
  return rows.map((r) => ({
    userId: r.userId,
    nickname: r.nickname,
    publicCode: r.publicCode,
    value: Number(r.value),
    rank: r.rank,
  }));
}
const safeTop = (m: LeaderboardMetric, sid: number, n: number) =>
  withTimeout(snapshotTop(m, sid, n), TIMEOUT_MS, `leaderboard.top.${m}`).catch(() => [] as LeaderboardEntry[]);

export type MyRankSnap = { value: number; rank: number } | null;

/** 내 순위 — PK 단일행. 없으면 null(신규/미집계). */
async function snapshotMyRank(metric: LeaderboardMetric, serverId: number, userId: string): Promise<MyRankSnap> {
  const [r] = await db
    .select({ value: leaderboardRanks.value, rank: leaderboardRanks.rank })
    .from(leaderboardRanks)
    .where(
      and(
        eq(leaderboardRanks.serverId, serverId),
        eq(leaderboardRanks.metric, metric),
        eq(leaderboardRanks.userId, userId),
      ),
    )
    .limit(1);
  return r ? { value: Number(r.value), rank: r.rank } : null;
}
const safeMyRank = (m: LeaderboardMetric, sid: number, uid: string) =>
  withTimeout(snapshotMyRank(m, sid, uid), TIMEOUT_MS, `leaderboard.mine.${m}`).catch(() => null);

/** 임의 값의 순위 — 나보다 큰 값 수 + 1((server,metric,value) 인덱스 count). 강화 직후 실시간 순위용. */
async function rankByValue(
  metric: LeaderboardMetric,
  serverId: number,
  userId: string,
  myValue: number,
): Promise<MyRankSnap> {
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leaderboardRanks)
    .where(
      and(
        eq(leaderboardRanks.serverId, serverId),
        eq(leaderboardRanks.metric, metric),
        ne(leaderboardRanks.userId, userId),
        gt(leaderboardRanks.value, myValue),
      ),
    );
  return { value: myValue, rank: (c?.n ?? 0) + 1 };
}
const safeRankByValue = (m: LeaderboardMetric, sid: number, uid: string, v: number) =>
  withTimeout(rankByValue(m, sid, uid, v), TIMEOUT_MS, `leaderboard.after.${m}`).catch(() => null);

/** Top + 내 순위 — 스냅샷 2쿼리(Top-N 인덱스 + PK 단일행). */
export async function getLeaderboardPayload(
  metric: LeaderboardMetric,
  serverId: number,
  userId: string,
): Promise<{ top: LeaderboardEntry[]; mine: MyRankSnap }> {
  const [topRows, mine] = await Promise.all([
    safeTop(metric, serverId, TOP),
    safeMyRank(metric, serverId, userId),
  ]);
  const top = await attachProfiles(serverId, topRows);
  return { top, mine: mine ? { rank: mine.rank, value: mine.value } : null };
}

/** 홈 카드 등 — userId 무관 Top N. */
export async function getRankingTop(
  metric: LeaderboardMetric,
  serverId: number,
  n: number,
): Promise<LeaderboardEntry[]> {
  const rows = await safeTop(metric, serverId, n);
  return attachProfiles(serverId, rows);
}

export type MyRanks = { max: MyRankSnap; sum: MyRankSnap; combat: MyRankSnap };

/** 강화 직전 — 스냅샷의 본인 3 메트릭 순위(PK 단일행 ×3). */
export async function getMyRanks(userId: string, serverId: number): Promise<MyRanks> {
  const [max, sum, combat] = await Promise.all([
    safeMyRank('max', serverId, userId),
    safeMyRank('sum', serverId, userId),
    safeMyRank('combat', serverId, userId),
  ]);
  return { max, sum, combat };
}

/** 프로필 상세용 — 레이드 처치·대난투 우승 본인 순위. */
export type MyCountRanks = { raid: MyRankSnap; melee: MyRankSnap };
export async function getMyCountRanks(userId: string, serverId: number): Promise<MyCountRanks> {
  const [raid, melee] = await Promise.all([
    safeMyRank('raid', serverId, userId),
    safeMyRank('melee', serverId, userId),
  ]);
  return { raid, melee };
}

/**
 * 강화 직후 — 본인의 새 stat은 DB에서 직접 read(내 장비만), 순위는 스냅샷에 count(value>내값)+1.
 * 본인 값은 실시간, 타 유저는 스냅샷 시점 — 강화 직후 순위 변동 즉시 반영(스냅샷 전체 리스트 불필요).
 */
export async function getMyRanksAfter(userId: string, serverId: number): Promise<MyRanks> {
  const eqRows = await db
    .select({
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)));
  const myMax = eqRows.reduce((acc, r) => Math.max(acc, r.enhanceLevel), 0);
  const mySum = eqRows.reduce((acc, r) => acc + r.enhanceLevel, 0);
  const myCombat = Math.round(combatPowerFromOwned(eqRows));

  const [max, sum, combat] = await Promise.all([
    myMax > 0 ? safeRankByValue('max', serverId, userId, myMax) : Promise.resolve(null),
    mySum > 0 ? safeRankByValue('sum', serverId, userId, mySum) : Promise.resolve(null),
    eqRows.length > 0 ? safeRankByValue('combat', serverId, userId, myCombat) : Promise.resolve(null),
  ]);
  return { max, sum, combat };
}
