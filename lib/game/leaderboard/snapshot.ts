import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { meleeBattles } from '@/lib/db/schema/melee';
import { leaderboardRanks, codexChampions } from '@/lib/db/schema/leaderboard';
import { userMilestones } from '@/lib/db/schema/world';
import { milestoneOf } from '@/lib/game/milestone';
import { logWorldEvent } from '@/lib/game/world/event';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
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
 * 한 서버의 메트릭 스냅샷 재계산·적재(기본 5종, metrics로 부분 지정 — combat은 무거워 cron에서
 * 저빈도 tick에만). 메트릭별로 (server,metric) 전 행을 단일 트랜잭션 내 delete+insert로 원자 교체.
 */
export async function rebuildLeaderboardSnapshot(
  serverId: number,
  metrics: LeaderboardMetric[] = METRICS,
): Promise<Partial<Record<LeaderboardMetric, number>>> {
  const counts = {} as Partial<Record<LeaderboardMetric, number>>;
  for (const metric of metrics) {
    const rows = (await ROWS_FN[metric](serverId)).sort((a, b) => b.value - a.value);
    // 경쟁 순위(1,2,2,4 — 동점은 같은 등수) — queries.rankByValue의 count(value>x)+1과 일치(감사 S3).
    // 순차(i+1)는 동점에 임의 다른 등수를 줘 before(스냅샷)/after(실시간)가 어긋났음.
    let prevVal: number | null = null;
    let prevRank = 0;
    const ranked = rows.map((r, i) => {
      const rank = prevVal !== null && r.value === prevVal ? prevRank : i + 1;
      prevVal = r.value;
      prevRank = rank;
      return { serverId, metric, userId: r.userId, value: r.value, rank };
    });
    await db.transaction(async (tx) => {
      await tx
        .delete(leaderboardRanks)
        .where(and(eq(leaderboardRanks.serverId, serverId), eq(leaderboardRanks.metric, metric)));
      for (let i = 0; i < ranked.length; i += 500) {
        await tx.insert(leaderboardRanks).values(ranked.slice(i, i + 500));
      }
    });
    counts[metric] = ranked.length;
    // 개인 기록 마일스톤(2026-07-06) — 이 지표들의 전 유저 값을 여기서 이미 계산하므로
    // 워터마크 교차를 감지해 월드·길드 로그를 남긴다(핫패스 비용 0, 최대 15분 지연 허용).
    if (metric === 'sum' || metric === 'combat' || metric === 'raid' || metric === 'melee') {
      await logPersonalMilestones(serverId, metric, rows).catch((e) =>
        console.warn('[milestone]', metric, (e as Error).message),
      );
    }
  }
  return counts;
}

/**
 * 워터마크 교차 감지 → 월드+길드 로그. 워터마크는 단조(마지막 기록 마일스톤) — 하락 후
 * 재달성 재발화 없음. 한 번에 여러 임계를 건너뛰어도 최고 임계 1건만 기록(스팸 방지).
 */
async function logPersonalMilestones(
  serverId: number,
  metric: 'sum' | 'combat' | 'raid' | 'melee',
  rows: Row[],
): Promise<void> {
  const eligible = rows
    .map((r) => ({ userId: r.userId, mile: milestoneOf(metric, r.value) }))
    .filter((r) => r.mile > 0);
  if (eligible.length === 0) return;
  const marks = await db
    .select({ userId: userMilestones.userId, milestone: userMilestones.milestone })
    .from(userMilestones)
    .where(
      and(
        eq(userMilestones.serverId, serverId),
        eq(userMilestones.metric, metric),
        inArray(userMilestones.userId, eligible.map((r) => r.userId)),
      ),
    );
  const markBy = new Map(marks.map((m) => [m.userId, Number(m.milestone)]));
  for (const r of eligible) {
    if (r.mile <= (markBy.get(r.userId) ?? 0)) continue;
    await db
      .insert(userMilestones)
      .values({ userId: r.userId, serverId, metric, milestone: BigInt(r.mile) })
      .onConflictDoUpdate({
        target: [userMilestones.userId, userMilestones.serverId, userMilestones.metric],
        set: { milestone: BigInt(r.mile), updatedAt: new Date() },
      });
    await logWorldEvent(serverId, 'personal_milestone', { metric, milestone: r.mile }, { actorUserId: r.userId });
    await logMemberAchievement(r.userId, serverId, {
      action: 'achv_milestone',
      detail: { metric, milestone: r.mile },
    });
  }
}

/**
 * 아이템(catalog)별 강화랭킹 상위3 스냅샷 재계산(감사 S3). row_number ≤ 3을 DB에서 단일 SQL로
 * 산출 → (server) 전 행 delete+insert 원자 교체. ue_catalog_rank_idx(max_enhance_level)로 인덱스 정렬.
 */
/**
 * 단일 아이템 파티션만 재계산 — 강화 완료 직후 해방 즉시 반영용(체감 선반영 복원).
 * 대상이 해당 아이템 보유자뿐이라 저비용. 전체 재계산(15분 cron)은 백스톱으로 유지.
 */
export async function rebuildCodexChampionsForItem(serverId: number, catalogItemId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(codexChampions)
      .where(and(eq(codexChampions.serverId, serverId), eq(codexChampions.catalogItemId, catalogItemId)));
    await tx.execute(sql`
      insert into codex_champions (server_id, catalog_item_id, user_id, rank)
      select ${serverId}, ${catalogItemId}, user_id, rn
      from (
        select user_id,
          row_number() over (
            order by max_enhance_level desc, max_enhance_reached_at asc, user_id asc
          ) as rn
        from user_equipment
        where server_id = ${serverId} and catalog_item_id = ${catalogItemId} and max_enhance_level > 0
      ) t
      where rn <= 3
    `);
  });
}

export async function rebuildCodexChampions(serverId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(codexChampions).where(eq(codexChampions.serverId, serverId));
    await tx.execute(sql`
      insert into codex_champions (server_id, catalog_item_id, user_id, rank)
      select ${serverId}, catalog_item_id, user_id, rn
      from (
        select catalog_item_id, user_id,
          row_number() over (
            partition by catalog_item_id
            order by max_enhance_level desc, max_enhance_reached_at asc, user_id asc
          ) as rn
        from user_equipment
        where server_id = ${serverId} and max_enhance_level > 0
      ) t
      where rn <= 3
    `);
  });
}
