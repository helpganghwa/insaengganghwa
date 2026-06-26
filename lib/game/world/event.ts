import 'server-only';

import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { worldEvents, rankingLeaders } from '@/lib/db/schema/world';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds, zones } from '@/lib/db/schema/guild';
import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';
import { getGuildRanking } from '@/lib/game/guild/queries';
import { logMemberAchievement } from '@/lib/game/guild/achievement';

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
    // 동일 ms 이벤트(cron 연속 insert) 순서 결정성 — id(bigserial 삽입순) 2차키(감사 F4).
    .orderBy(desc(worldEvents.createdAt), desc(worldEvents.id))
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
      // 길드원이면 길드 로그에도 노출(월드 로그와 동일 사건). best-effort.
      await logMemberAchievement(leader.userId, serverId, { action: 'achv_rank_leader', detail: { metric } });
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

/**
 * 길드 전투력·점령지 1위 교체 감지(준실시간 cron) — world_events 피드 자체를 "직전 1위" 상태로
 * 사용(별도 추적 테이블 불필요). 동type 최신 이벤트의 guildId와 현재 1위가 다르면 기록.
 * 길드 수가 적어 첫 관측도 발표(시드 억제 없음). 일일 길드 업적(top3 feed)과는 분리.
 */
export async function runGuildLeaders(serverId: number): Promise<number> {
  // 전투력 1위 + 점령지(소유 구역 수) 1위.
  const power = (await getGuildRanking(serverId, 1))[0] ?? null;
  const [zoneTop] = await db
    .select({ guildId: zones.ownerGuildId, n: sql<number>`count(*)::int` })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), isNotNull(zones.ownerGuildId)))
    .groupBy(zones.ownerGuildId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const targets = [
    ['guild_power_1', power?.id ?? null],
    ['guild_zone_1', zoneTop?.guildId ?? null],
  ] as const;

  let logged = 0;
  for (const [type, guildId] of targets) {
    if (guildId == null) continue;
    // 직전 발표된 1위 = 동type 최신 이벤트의 guildId(피드 = 상태). 같으면 스킵.
    const [last] = await db
      .select({ guildId: worldEvents.guildId })
      .from(worldEvents)
      .where(and(eq(worldEvents.serverId, serverId), eq(worldEvents.type, type)))
      .orderBy(desc(worldEvents.id))
      .limit(1);
    if (last?.guildId === guildId) continue;
    const [g] = await db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    await logWorldEvent(serverId, type, { guildName: g?.name ?? '길드' }, { guildId });
    logged += 1;
  }
  return logged;
}
