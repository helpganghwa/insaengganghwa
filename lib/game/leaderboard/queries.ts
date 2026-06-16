import 'server-only';

import { unstable_cache } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { meleeBattles } from '@/lib/db/schema/melee';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';

/**
 * 랭킹 — BALANCE §3.3. **시즌제 없음·상시 누적·Top 100**.
 * 최고 강화 = 보유 단일 최고 enhance_level / 합산 강화 = Σ 보유 인스턴스 enhance_level /
 * 전투력 = 보유 카탈로그(중복 제외) 개별 전투력 합(BALANCE §3.2 — combat은 앱 계산).
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

/**
 * top entries에 대표 프로필 이미지 + 배경을 batch로 붙임(metric 쿼리와 분리).
 * profiles.active_profile_id → user_profiles 조인, active_background → public src.
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
    // 콜드/hang → 이미지 없이 순위만 반환(페이지 응답 보장).
    return entries.map((e) => ({ ...e, profileImg: null, guildEmblemUrl: null }));
  }
  const map = new Map(
    rows.map((r) => {
      const rot = r.rotations as Record<string, string> | null;
      const img = rot && r.activeDirection ? (rot[r.activeDirection] ?? null) : null;
      return [r.userId, img] as const;
    }),
  );
  // 길드 문양 batch(실패해도 순위는 반환).
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

async function maxRows(serverId: number) {
  const r = await db
    .select({
      userId: userEquipment.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: sql<number>`max(${userEquipment.enhanceLevel})::int`,
    })
    .from(userEquipment)
    .innerJoin(profiles, eq(profiles.id, userEquipment.userId))
    .innerJoin(
      characters,
      and(eq(characters.userId, userEquipment.userId), eq(characters.serverId, serverId)),
    )
    .where(eq(userEquipment.serverId, serverId))
    .groupBy(userEquipment.userId, characters.nickname, profiles.publicCode);
  return r.map((x) => ({ userId: x.userId, nickname: x.nickname, publicCode: x.publicCode, value: Number(x.value) }));
}

async function sumRows(serverId: number) {
  // 합산 강화 = **현재 보유 인스턴스의 enhance_level 합**(2026-05-31 정책 변경).
  // 이전: sum(user_codex.max_enhance_level)는 lifetime 누적이라 강화 하락에 비반응 →
  // 현재 상태와 어긋남. 도감 자체는 콜렉션 진척으로 유지(여기서만 분리).
  const r = await db
    .select({
      userId: userEquipment.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: sql<number>`coalesce(sum(${userEquipment.enhanceLevel}),0)::int`,
    })
    .from(userEquipment)
    .innerJoin(profiles, eq(profiles.id, userEquipment.userId))
    .innerJoin(
      characters,
      and(eq(characters.userId, userEquipment.userId), eq(characters.serverId, serverId)),
    )
    .where(eq(userEquipment.serverId, serverId))
    .groupBy(userEquipment.userId, characters.nickname, profiles.publicCode);
  return r.map((x) => ({ userId: x.userId, nickname: x.nickname, publicCode: x.publicCode, value: Number(x.value) }));
}

async function combatRows(serverId: number) {
  // 단일 SQL aggregate — 유저별 보유 전 인스턴스를 [catalog, L, T]로 json_agg(풀 점유 1쿼리).
  // 카탈로그 dedup·최강 선택은 앱에서(pieceCombatPower 단일 진실, SQL 공식 중복 금지).
  const rows = (await db.execute(sql`
    select p.id::text as id, c.nickname, p.public_code,
           coalesce(
             json_agg(json_build_array(e.catalog_item_id, e.enhance_level, e.transcend_level))
               filter (where e.user_id is not null),
             '[]'::json
           ) as items
    from profiles p
    join characters c on c.user_id = p.id and c.server_id = ${serverId}
    left join user_equipment e on e.user_id = p.id and e.server_id = ${serverId}
    group by p.id, c.nickname, p.public_code
  `)) as unknown as {
    id: string;
    nickname: string;
    public_code: string;
    items: [number, number, number][];
  }[];
  return rows.map((r) => ({
    userId: r.id,
    nickname: r.nickname,
    publicCode: r.public_code,
    value: combatPowerFromOwned(
      r.items.map(([catalogItemId, enhanceLevel, transcendLevel]) => ({
        catalogItemId,
        enhanceLevel,
        transcendLevel,
      })),
    ),
  }));
}

// 레이드 처치 = 참여(공격≥1)한 정산 레이드 수(phasesCleared≥1). 보스 1회=1처치 카운트.
async function raidRows(serverId: number) {
  const r = await db
    .select({
      userId: raidParticipants.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: sql<number>`count(distinct ${raidParticipants.raidId})::int`,
    })
    .from(raidParticipants)
    .innerJoin(profiles, eq(profiles.id, raidParticipants.userId))
    .innerJoin(
      characters,
      and(eq(characters.userId, raidParticipants.userId), eq(characters.serverId, serverId)),
    )
    .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
    .where(
      and(
        eq(raids.serverId, serverId),
        eq(raids.status, 'settled'),
        sql`${raids.phasesCleared} >= 1`,
        sql`${raidParticipants.attacksUsed} >= 1`,
      ),
    )
    .groupBy(raidParticipants.userId, characters.nickname, profiles.publicCode);
  return r.map((x) => ({ userId: x.userId, nickname: x.nickname, publicCode: x.publicCode, value: Number(x.value) }));
}

// 대난투 우승 = 발표된 배틀의 챔피언(championUserId) 횟수.
async function meleeRows(serverId: number) {
  const r = await db
    .select({
      userId: meleeBattles.championUserId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: sql<number>`count(*)::int`,
    })
    .from(meleeBattles)
    .innerJoin(profiles, eq(profiles.id, meleeBattles.championUserId))
    .innerJoin(
      characters,
      and(eq(characters.userId, meleeBattles.championUserId), eq(characters.serverId, serverId)),
    )
    .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.status, 'revealed')))
    .groupBy(meleeBattles.championUserId, characters.nickname, profiles.publicCode);
  return r.map((x) => ({ userId: x.userId!, nickname: x.nickname, publicCode: x.publicCode, value: Number(x.value) }));
}

// metric별 unstable_cache 60s — 한 번 fetch 후 60s 동안 즉시(메모리/ISR) 응답.
// 풀(max:1) 직렬 압력으로 SSR 매달림이 무한 로딩 원인 → 캐시로 fetch 자체 회피.
// 첫 캐시 미스 시는 timeout 8s 가드 + 빈 폴백(페이지는 항상 응답).
// metric×server별 unstable_cache 60s — 키에 serverId 포함(서버별 랭킹).
const ROWS_FN: Record<LeaderboardMetric, (sid: number) => Promise<{ userId: string; nickname: string; publicCode: string; value: number }[]>> = {
  max: maxRows,
  sum: sumRows,
  combat: combatRows,
  raid: raidRows,
  melee: meleeRows,
};
const cachedRows = (m: LeaderboardMetric, sid: number) =>
  unstable_cache(() => ROWS_FN[m](sid), [`leaderboard:${m}:${sid}`], {
    revalidate: 60,
    tags: ['leaderboard'],
  })();

const TIMEOUT_MS = 3000;
const safeRows = (m: LeaderboardMetric, sid: number) =>
  withTimeout(cachedRows(m, sid), TIMEOUT_MS, `leaderboard.${m}`).catch(
    () => [] as { userId: string; nickname: string; publicCode: string; value: number }[],
  );

/**
 * Top + 내 순위 — **단일 쿼리 1회**로 둘 다 계산(같은 데이터를 두 번 안 가져옴).
 * 라우트 전환 시 풀 점유 시간 절반 → 간헐적 무한 로딩 완화.
 */
export async function getLeaderboardPayload(
  metric: LeaderboardMetric,
  serverId: number,
  userId: string,
): Promise<{
  top: LeaderboardEntry[];
  mine: { rank: number; value: number } | null;
}> {
  const rows = (await safeRows(metric, serverId)).sort((a, b) => b.value - a.value);
  const top = await attachProfiles(serverId, rows.slice(0, TOP).map((r, i) => ({ ...r, rank: i + 1 })));
  const idx = rows.findIndex((r) => r.userId === userId);
  const mine = idx < 0 ? null : { rank: idx + 1, value: rows[idx]!.value };
  return { top, mine };
}

/** 홈 카드 등 — userId 무관 Top N. 캐싱된 row 재사용. */
export async function getRankingTop(
  metric: LeaderboardMetric,
  serverId: number,
  n: number,
): Promise<LeaderboardEntry[]> {
  const rows = (await safeRows(metric, serverId)).sort((a, b) => b.value - a.value);
  return attachProfiles(serverId, rows.slice(0, n).map((r, i) => ({ ...r, rank: i + 1 })));
}

/** before/after 비교용 단일 메트릭 스냅샷. null = 데이터 없음(신규 유저). */
export type MyRankSnap = { value: number; rank: number } | null;
export type MyRanks = { max: MyRankSnap; sum: MyRankSnap; combat: MyRankSnap };

/**
 * 강화 직전 — 캐시(60s) 시점 사용자 본인의 3 메트릭 + 순위.
 * safeRows(unstable_cache 60s) 그대로 사용 — 풀 점유 없음.
 */
export async function getMyRanks(userId: string, serverId: number): Promise<MyRanks> {
  const [maxR, sumR, combatR] = await Promise.all([
    safeRows('max', serverId),
    safeRows('sum', serverId),
    safeRows('combat', serverId),
  ]);
  const find = (rows: { userId: string; value: number }[]): MyRankSnap => {
    const sorted = rows.slice().sort((a, b) => b.value - a.value);
    const idx = sorted.findIndex((r) => r.userId === userId);
    return idx < 0 ? null : { value: sorted[idx]!.value, rank: idx + 1 };
  };
  return { max: find(maxR), sum: find(sumR), combat: find(combatR) };
}

/** 프로필 상세용 — 레이드 처치·대난투 우승 본인 값+순위(없으면 null). */
export type MyCountRanks = { raid: MyRankSnap; melee: MyRankSnap };
export async function getMyCountRanks(userId: string, serverId: number): Promise<MyCountRanks> {
  const [raidR, meleeR] = await Promise.all([safeRows('raid', serverId), safeRows('melee', serverId)]);
  const find = (rows: { userId: string; value: number }[]): MyRankSnap => {
    const sorted = rows.slice().sort((a, b) => b.value - a.value);
    const idx = sorted.findIndex((r) => r.userId === userId);
    return idx < 0 ? null : { value: sorted[idx]!.value, rank: idx + 1 };
  };
  return { raid: find(raidR), melee: find(meleeR) };
}

/**
 * 강화 직후 — 본인의 새 stat은 DB에서 직접 read(캐시 우회), 다른 유저는 캐시 정렬
 * 그대로. 본인 new value 기준 bisect → before와 같은 캐시 시점이라도 실제 변동 반영.
 *
 * 비용: 본인의 단일 쿼리(equipment + codex)만 추가. ranking은 캐시 60s 그대로.
 */
export async function getMyRanksAfter(userId: string, serverId: number): Promise<MyRanks> {
  // 보유 전 인스턴스 1회 read → max/sum/combat 3 메트릭 모두 산출(캐시 우회).
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
  const myCombat = combatPowerFromOwned(eqRows);

  const [maxR, sumR, combatR] = await Promise.all([
    safeRows('max', serverId),
    safeRows('sum', serverId),
    safeRows('combat', serverId),
  ]);
  const bisect = (
    rows: { userId: string; value: number }[],
    myValue: number,
  ): MyRankSnap => {
    const others = rows.filter((r) => r.userId !== userId).sort((a, b) => b.value - a.value);
    let i = 0;
    while (i < others.length && others[i]!.value > myValue) i++;
    return { value: myValue, rank: i + 1 };
  };
  return {
    max: myMax > 0 ? bisect(maxR, myMax) : null,
    sum: mySum > 0 ? bisect(sumR, mySum) : null,
    combat: eqRows.length > 0 ? bisect(combatR, myCombat) : null,
  };
}
