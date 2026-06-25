import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldEvents, rankingLeaders } from '@/lib/db/schema/world';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';

/** 월드 피드 사건 종류. detail 스키마는 각 logWorldEvent 호출부 + WorldLogFeed 렌더 참조. */
export type WorldEventType =
  | 'melee_rank' // 대난투 1~3위 — detail { rank }
  | 'enhance' // 강화 100단위 — detail { item, level }
  | 'transcend' // 초월 10단위 — detail { item, level }
  | 'guild_create' // 길드 결성 — detail { guildName }
  | 'guild_power_1' // 길드 전투력 1위 교체 — detail { guildName }
  | 'guild_zone_1' // 길드 점령지 1위 교체 — detail { guildName }
  | 'rank_leader'; // 랭킹 5종 유저 1위 교체 — detail { metric, value }

/** 홈 월드 피드 1건 — actor 닉네임·공개코드 해소(프로필 링크 = 코드+서버). */
export type WorldEventEntry = {
  id: string;
  type: string;
  serverId: number;
  actorNickname: string | null;
  actorCode: string | null;
  detail: Record<string, unknown> | null;
  createdAtIso: string;
};

/**
 * 월드 이벤트 1건 기록 — best-effort(실패해도 정산/액션에 영향 없음). 길드원 여부 무관 전체 유저.
 * 마일스톤 지점에서만 호출하므로 빈도 낮음(강화 100단위·초월 10단위·대난투 1~3위·1위 교체 등).
 */
export async function logWorldEvent(
  serverId: number,
  type: WorldEventType,
  detail: Record<string, unknown>,
  opts?: { actorUserId?: string; guildId?: bigint },
): Promise<void> {
  try {
    await db.insert(worldEvents).values({
      serverId,
      type,
      actorUserId: opts?.actorUserId ?? null,
      guildId: opts?.guildId ?? null,
      detail,
    });
  } catch {
    // best-effort — 기록 실패는 무시.
  }
}

/** 홈 월드 피드 — server_id 최신순 limit건 + actor 닉/코드 일괄 해소. */
export async function getWorldFeed(serverId: number, limit = 40): Promise<WorldEventEntry[]> {
  const rows = await db
    .select({
      id: worldEvents.id,
      type: worldEvents.type,
      actorUserId: worldEvents.actorUserId,
      detail: worldEvents.detail,
      createdAt: worldEvents.createdAt,
    })
    .from(worldEvents)
    .where(eq(worldEvents.serverId, serverId))
    .orderBy(desc(worldEvents.createdAt))
    .limit(limit);

  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v))];
  const nameMap = new Map<string, string>();
  const codeMap = new Map<string, string>();
  if (ids.length) {
    const [chars, profs] = await Promise.all([
      db
        .select({ userId: characters.userId, nickname: characters.nickname })
        .from(characters)
        .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids))),
      db
        .select({ id: profiles.id, code: profiles.publicCode })
        .from(profiles)
        .where(inArray(profiles.id, ids)),
    ]);
    for (const c of chars) nameMap.set(c.userId, c.nickname);
    for (const p of profs) codeMap.set(p.id, p.code);
  }

  return rows.map((r) => ({
    id: r.id.toString(),
    type: r.type,
    serverId,
    actorNickname: r.actorUserId ? (nameMap.get(r.actorUserId) ?? null) : null,
    actorCode: r.actorUserId ? (codeMap.get(r.actorUserId) ?? null) : null,
    detail: (r.detail as Record<string, unknown> | null) ?? null,
    createdAtIso: r.createdAt.toISOString(),
  }));
}

const LEADER_METRICS: LeaderboardMetric[] = ['max', 'sum', 'combat', 'raid', 'melee'];

/**
 * 랭킹 5종 유저 1위 교체 감지(일일 cron) — metric별 현재 1위를 ranking_leaders와 비교해 바뀌면
 * world_events(rank_leader) 기록 후 갱신. 첫 관측(저장 없음)은 기록 없이 시드만(초기 스팸 방지).
 */
export async function runRankingLeaders(serverId: number): Promise<number> {
  const prev = await db
    .select({ metric: rankingLeaders.metric, userId: rankingLeaders.userId })
    .from(rankingLeaders)
    .where(eq(rankingLeaders.serverId, serverId));
  const prevMap = new Map(prev.map((p) => [p.metric, p.userId]));

  let logged = 0;
  for (const metric of LEADER_METRICS) {
    const [leader] = await getRankingTop(metric, serverId, 1);
    if (!leader) continue;
    const before = prevMap.get(metric);
    if (before === leader.userId) continue; // 동일 1위 — 스킵.
    // 첫 관측(시드 없음)은 기록 없이 시드만 — 초기 일괄 스팸 방지.
    if (before !== undefined) {
      await logWorldEvent(
        serverId,
        'rank_leader',
        { metric, value: leader.value },
        { actorUserId: leader.userId },
      );
      logged += 1;
    }
    await db
      .insert(rankingLeaders)
      .values({ serverId, metric, userId: leader.userId })
      .onConflictDoUpdate({
        target: [rankingLeaders.serverId, rankingLeaders.metric],
        set: { userId: leader.userId, updatedAt: sql`now()` },
      });
  }
  return logged;
}
