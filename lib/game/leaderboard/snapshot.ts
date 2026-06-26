import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { meleeBattles } from '@/lib/db/schema/melee';
import { leaderboardRanks } from '@/lib/db/schema/leaderboard';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import type { LeaderboardMetric } from './queries';

type Row = { userId: string; value: number };

// ── 메트릭별 전 유저 집계(무거운 작업 — cron 전용, 요청 경로에서 호출 금지) ──

async function maxRows(serverId: number): Promise<Row[]> {
  const r = await db
    .select({ userId: userEquipment.userId, value: sql<number>`max(${userEquipment.enhanceLevel})::int` })
    .from(userEquipment)
    .where(eq(userEquipment.serverId, serverId))
    .groupBy(userEquipment.userId);
  return r.map((x) => ({ userId: x.userId, value: Number(x.value) }));
}

async function sumRows(serverId: number): Promise<Row[]> {
  const r = await db
    .select({ userId: userEquipment.userId, value: sql<number>`coalesce(sum(${userEquipment.enhanceLevel}),0)::int` })
    .from(userEquipment)
    .where(eq(userEquipment.serverId, serverId))
    .groupBy(userEquipment.userId);
  return r.map((x) => ({ userId: x.userId, value: Number(x.value) }));
}

async function combatRows(serverId: number): Promise<Row[]> {
  // 유저별 보유 전 인스턴스를 json_agg(1쿼리) → 앱에서 카탈로그 dedup·최강 선택(pieceCombatPower 단일 진실).
  const rows = (await db.execute(sql`
    select p.id::text as id,
           coalesce(
             json_agg(json_build_array(e.catalog_item_id, e.enhance_level, e.transcend_level))
               filter (where e.user_id is not null),
             '[]'::json
           ) as items
    from profiles p
    join characters c on c.user_id = p.id and c.server_id = ${serverId}
    left join user_equipment e on e.user_id = p.id and e.server_id = ${serverId}
    group by p.id
  `)) as unknown as { id: string; items: [number, number, number][] }[];
  return rows.map((r) => ({
    userId: r.id,
    value: Math.round(
      combatPowerFromOwned(
        r.items.map(([catalogItemId, enhanceLevel, transcendLevel]) => ({
          catalogItemId,
          enhanceLevel,
          transcendLevel,
        })),
      ),
    ),
  }));
}

async function raidRows(serverId: number): Promise<Row[]> {
  const r = await db
    .select({ userId: raidParticipants.userId, value: sql<number>`count(distinct ${raidParticipants.raidId})::int` })
    .from(raidParticipants)
    .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
    .where(
      and(
        eq(raids.serverId, serverId),
        eq(raids.status, 'settled'),
        sql`${raids.phasesCleared} >= 1`,
        sql`${raidParticipants.attacksUsed} >= 1`,
      ),
    )
    .groupBy(raidParticipants.userId);
  return r.map((x) => ({ userId: x.userId, value: Number(x.value) }));
}

async function meleeRows(serverId: number): Promise<Row[]> {
  const r = await db
    .select({ userId: meleeBattles.championUserId, value: sql<number>`count(*)::int` })
    .from(meleeBattles)
    .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.status, 'revealed')))
    .groupBy(meleeBattles.championUserId);
  return r
    .filter((x): x is { userId: string; value: number } => x.userId != null)
    .map((x) => ({ userId: x.userId, value: Number(x.value) }));
}

const ROWS_FN: Record<LeaderboardMetric, (sid: number) => Promise<Row[]>> = {
  max: maxRows,
  sum: sumRows,
  combat: combatRows,
  raid: raidRows,
  melee: meleeRows,
};
const METRICS = Object.keys(ROWS_FN) as LeaderboardMetric[];

/**
 * 한 서버의 5개 메트릭 스냅샷 재계산·적재. 메트릭별로 (server,metric) 전 행을 단일 트랜잭션 내
 * delete+insert로 원자 교체(외부 읽기엔 커밋 전까진 이전 값, 커밋 후 새 값 — 빈 창 없음).
 */
export async function rebuildLeaderboardSnapshot(
  serverId: number,
): Promise<Record<LeaderboardMetric, number>> {
  const counts = {} as Record<LeaderboardMetric, number>;
  for (const metric of METRICS) {
    const rows = (await ROWS_FN[metric](serverId)).sort((a, b) => b.value - a.value);
    const ranked = rows.map((r, i) => ({
      serverId,
      metric,
      userId: r.userId,
      value: r.value,
      rank: i + 1,
    }));
    await db.transaction(async (tx) => {
      await tx
        .delete(leaderboardRanks)
        .where(and(eq(leaderboardRanks.serverId, serverId), eq(leaderboardRanks.metric, metric)));
      for (let i = 0; i < ranked.length; i += 500) {
        await tx.insert(leaderboardRanks).values(ranked.slice(i, i + 500));
      }
    });
    counts[metric] = ranked.length;
  }
  return counts;
}
