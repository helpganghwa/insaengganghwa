import 'server-only';

import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, zones, guildAuditLog } from '@/lib/db/schema/guild';
import { logWorldEvent } from '@/lib/game/world/event';
import { getGuildRanking } from './queries';

/**
 * 길드 랭킹 업적 — 전투력·점령지 랭킹 1~3위를 길드 활동 피드에 노출(rank-achievements cron, 일일).
 *
 * 매일 재계산하므로 직전 랭크(guilds.last_power_rank/last_zone_rank)와 비교해 **변동 시에만** 기록
 * (같은 순위 유지는 중복 로깅 안 함). top3에서 빠진 길드는 저장 랭크를 null로 정리(재진입 시 다시 기록).
 */
type Top = { id: bigint; rank: number };

async function processCategory(
  serverId: number,
  top: Top[],
  col: 'lastPowerRank' | 'lastZoneRank',
  action: 'achv_guild_power_rank' | 'achv_guild_zone_rank',
): Promise<number> {
  const topIds = top.map((t) => t.id);
  // 직전 랭크 조회.
  const prev = top.length
    ? await db
        .select({ id: guilds.id, rank: guilds[col] })
        .from(guilds)
        .where(inArray(guilds.id, topIds))
    : [];
  const prevMap = new Map(prev.map((p) => [p.id.toString(), p.rank]));

  let logged = 0;
  for (const t of top) {
    if (prevMap.get(t.id.toString()) === t.rank) continue; // 변동 없음 — 스킵.
    await db.insert(guildAuditLog).values({
      serverId,
      guildId: t.id,
      actorUserId: null,
      action,
      targetUserId: null,
      detail: { rank: t.rank },
    });
    await db.update(guilds).set({ [col]: t.rank }).where(eq(guilds.id, t.id));
    logged += 1;
    // 월드 피드 — 1위로 새로 올라선 길드만 전체 노출(교체 시점, 기존 1위 유지는 위 continue로 스킵).
    if (t.rank === 1) {
      const [g] = await db.select({ name: guilds.name }).from(guilds).where(eq(guilds.id, t.id)).limit(1);
      await logWorldEvent(
        serverId,
        action === 'achv_guild_power_rank' ? 'guild_power_1' : 'guild_zone_1',
        { guildName: g?.name ?? '길드' },
        { guildId: t.id },
      );
    }
  }

  // top3에서 빠진 길드 — 저장 랭크 정리(로그 없음).
  await db
    .update(guilds)
    .set({ [col]: null })
    .where(
      and(
        eq(guilds.serverId, serverId),
        isNotNull(guilds[col]),
        ...(topIds.length ? [sql`${guilds.id} not in ${topIds}`] : []),
      ),
    );

  return logged;
}

/** 한 서버의 길드 랭킹 업적 1회 처리. */
export async function runGuildRankAchievements(serverId: number): Promise<{ power: number; zone: number }> {
  // 전투력 랭킹 top3.
  const ranking = await getGuildRanking(serverId, 3);
  const powerTop: Top[] = ranking.slice(0, 3).map((g, i) => ({ id: g.id, rank: i + 1 }));

  // 점령지(소유 존 수) 랭킹 top3.
  const zoneRows = await db
    .select({ guildId: zones.ownerGuildId, n: sql<number>`count(*)::int` })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), isNotNull(zones.ownerGuildId)))
    .groupBy(zones.ownerGuildId)
    .orderBy(desc(sql`count(*)`))
    .limit(3);
  const zoneTop: Top[] = zoneRows
    .filter((z): z is { guildId: bigint; n: number } => z.guildId != null)
    .map((z, i) => ({ id: z.guildId, rank: i + 1 }));

  const power = await processCategory(serverId, powerTop, 'lastPowerRank', 'achv_guild_power_rank');
  const zone = await processCategory(serverId, zoneTop, 'lastZoneRank', 'achv_guild_zone_rank');
  return { power, zone };
}
