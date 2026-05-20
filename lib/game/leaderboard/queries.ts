import 'server-only';

import { unstable_cache } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { equipmentInstances, userCodex } from '@/lib/db/schema/equipment';
import { combatPowerFromRows } from '@/lib/game/equipment/combat-power';

/**
 * 랭킹 — BALANCE §3.3. **시즌제 없음·상시 누적·Top 100**.
 * 최고 강화 = 보유 단일 최고 enhance_level / 합산 강화 = Σ user_codex.max_enhance_level /
 * 전투력 = (착용 3합)×(1+도감강화합×0.005) (P(L)는 balance 단일 진실 — combat은 앱 계산).
 */
export type LeaderboardMetric = 'max' | 'sum' | 'combat';
export type LeaderboardEntry = { userId: string; nickname: string; value: number; rank: number };
const TOP = 100;

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
  // 착용 장비 + 도감강화합 → 유저별 총 전투력(BALANCE §3.2). 프리런칭 규모 가정.
  const [equipped, codex, names] = await Promise.all([
    db
      .select({
        userId: equipmentInstances.userId,
        enhanceLevel: equipmentInstances.enhanceLevel,
        transcendLevel: equipmentInstances.transcendLevel,
      })
      .from(equipmentInstances)
      .where(sql`${equipmentInstances.equippedSlot} is not null`),
    db
      .select({
        userId: userCodex.userId,
        s: sql<number>`coalesce(sum(${userCodex.maxEnhanceLevel}),0)::int`,
      })
      .from(userCodex)
      .groupBy(userCodex.userId),
    db.select({ id: profiles.id, nickname: profiles.nickname }).from(profiles),
  ]);
  const codexSum = new Map(codex.map((c) => [c.userId, Number(c.s)]));
  const byUser = new Map<string, { enhanceLevel: number; transcendLevel: number }[]>();
  for (const e of equipped) {
    const arr = byUser.get(e.userId) ?? [];
    arr.push({ enhanceLevel: e.enhanceLevel, transcendLevel: e.transcendLevel });
    byUser.set(e.userId, arr);
  }
  return names.map((n) => ({
    userId: n.id,
    nickname: n.nickname,
    value: combatPowerFromRows(byUser.get(n.id) ?? [], codexSum.get(n.id) ?? 0),
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

const TIMEOUT_MS = 8000;
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
  const top = rows.slice(0, TOP).map((r, i) => ({ ...r, rank: i + 1 }));
  const idx = rows.findIndex((r) => r.userId === userId);
  const mine = idx < 0 ? null : { rank: idx + 1, value: rows[idx]!.value };
  return { top, mine };
}
