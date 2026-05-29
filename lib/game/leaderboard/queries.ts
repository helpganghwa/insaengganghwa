import 'server-only';

import { unstable_cache } from 'next/cache';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { equipmentInstances, userCodex } from '@/lib/db/schema/equipment';
import { combatPowerFromRows } from '@/lib/game/equipment/combat-power';

/**
 * 랭킹 — BALANCE §3.3. **시즌제 없음·상시 누적·Top 100**.
 * 최고 강화 = 보유 단일 최고 enhance_level / 합산 강화 = Σ user_codex.max_enhance_level /
 * 전투력 = (착용 3합)×(1+도감강화합×0.005) (P(L)는 balance 단일 진실 — combat은 앱 계산).
 */
export type LeaderboardMetric = 'max' | 'sum' | 'combat';
export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  value: number;
  rank: number;
  /** 대표 프로필 이미지 URL(없으면 null) */
  profileImg?: string | null;
};
const TOP = 100;

/**
 * top entries에 대표 프로필 이미지 + 배경을 batch로 붙임(metric 쿼리와 분리).
 * profiles.active_profile_id → user_profiles 조인, active_background → public src.
 */
async function attachProfiles(entries: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  if (entries.length === 0) return entries;
  let rows: { userId: string; rotations: unknown; activeDirection: string | null }[];
  try {
    rows = await withTimeout(
      db
        .select({
          userId: profiles.id,
          rotations: userProfiles.rotations,
          activeDirection: userProfiles.activeDirection,
        })
        .from(profiles)
        .leftJoin(userProfiles, eq(userProfiles.id, profiles.activeProfileId))
        .where(inArray(profiles.id, entries.map((e) => e.userId))),
      3000,
      'leaderboard.profiles',
    );
  } catch {
    // 콜드/hang → 이미지 없이 순위만 반환(페이지 응답 보장).
    return entries.map((e) => ({ ...e, profileImg: null }));
  }
  const map = new Map(
    rows.map((r) => {
      const rot = r.rotations as Record<string, string> | null;
      const img = rot && r.activeDirection ? (rot[r.activeDirection] ?? null) : null;
      return [r.userId, img] as const;
    }),
  );
  return entries.map((e) => ({ ...e, profileImg: map.get(e.userId) ?? null }));
}

async function maxRows() {
  const r = await db
    .select({
      userId: equipmentInstances.userId,
      nickname: profiles.nickname,
      value: sql<number>`max(${equipmentInstances.enhanceLevel})::int`,
    })
    .from(equipmentInstances)
    .innerJoin(profiles, eq(profiles.id, equipmentInstances.userId))
    .groupBy(equipmentInstances.userId, profiles.nickname);
  return r.map((x) => ({ userId: x.userId, nickname: x.nickname, value: Number(x.value) }));
}

async function sumRows() {
  const r = await db
    .select({
      userId: userCodex.userId,
      nickname: profiles.nickname,
      value: sql<number>`coalesce(sum(${userCodex.maxEnhanceLevel}),0)::int`,
    })
    .from(userCodex)
    .innerJoin(profiles, eq(profiles.id, userCodex.userId))
    .groupBy(userCodex.userId, profiles.nickname);
  return r.map((x) => ({ userId: x.userId, nickname: x.nickname, value: Number(x.value) }));
}

async function combatRows() {
  // 단일 SQL aggregate — 3 Promise.all + JS 합성 → 1 쿼리(풀 점유 1/3 + 디스크
  // 1 패스). 첫 캐시 미스 시 무한 로딩 원인이었던 풀 직렬 압력 해소.
  const rows = (await db.execute(sql`
    with eq as (
      select user_id,
             coalesce(json_agg(json_build_array(enhance_level, transcend_level)), '[]'::json) as pieces
      from equipment_instances
      where equipped_slot is not null
      group by user_id
    ),
    cdx as (
      select user_id, coalesce(sum(max_enhance_level), 0)::int as s
      from user_codex
      group by user_id
    )
    select p.id::text as id, p.nickname, coalesce(eq.pieces, '[]'::json) as pieces,
           coalesce(cdx.s, 0)::int as s
    from profiles p
    left join eq on eq.user_id = p.id
    left join cdx on cdx.user_id = p.id
  `)) as unknown as { id: string; nickname: string; pieces: [number, number][]; s: number }[];
  return rows.map((r) => ({
    userId: r.id,
    nickname: r.nickname,
    value: combatPowerFromRows(
      r.pieces.map(([enhanceLevel, transcendLevel]) => ({ enhanceLevel, transcendLevel })),
      Number(r.s),
    ),
  }));
}

// metric별 unstable_cache 60s — 한 번 fetch 후 60s 동안 즉시(메모리/ISR) 응답.
// 풀(max:1) 직렬 압력으로 SSR 매달림이 무한 로딩 원인 → 캐시로 fetch 자체 회피.
// 첫 캐시 미스 시는 timeout 8s 가드 + 빈 폴백(페이지는 항상 응답).
const cachedMax = unstable_cache(maxRows, ['leaderboard:max'], {
  revalidate: 60,
  tags: ['leaderboard'],
});
const cachedSum = unstable_cache(sumRows, ['leaderboard:sum'], {
  revalidate: 60,
  tags: ['leaderboard'],
});
const cachedCombat = unstable_cache(combatRows, ['leaderboard:combat'], {
  revalidate: 60,
  tags: ['leaderboard'],
});

const TIMEOUT_MS = 3000;
const safeRows = (m: LeaderboardMetric) => {
  const fn = m === 'max' ? cachedMax : m === 'sum' ? cachedSum : cachedCombat;
  return withTimeout(fn(), TIMEOUT_MS, `leaderboard.${m}`).catch(() => []);
};

/**
 * Top + 내 순위 — **단일 쿼리 1회**로 둘 다 계산(같은 데이터를 두 번 안 가져옴).
 * 라우트 전환 시 풀 점유 시간 절반 → 간헐적 무한 로딩 완화.
 */
export async function getLeaderboardPayload(
  metric: LeaderboardMetric,
  userId: string,
): Promise<{
  top: LeaderboardEntry[];
  mine: { rank: number; value: number } | null;
}> {
  const rows = (await safeRows(metric)).sort((a, b) => b.value - a.value);
  const top = await attachProfiles(rows.slice(0, TOP).map((r, i) => ({ ...r, rank: i + 1 })));
  const idx = rows.findIndex((r) => r.userId === userId);
  const mine = idx < 0 ? null : { rank: idx + 1, value: rows[idx]!.value };
  return { top, mine };
}

/** 홈 카드 등 — userId 무관 Top N. 캐싱된 row 재사용. */
export async function getRankingTop(
  metric: LeaderboardMetric,
  n: number,
): Promise<LeaderboardEntry[]> {
  const rows = (await safeRows(metric)).sort((a, b) => b.value - a.value);
  return attachProfiles(rows.slice(0, n).map((r, i) => ({ ...r, rank: i + 1 })));
}
