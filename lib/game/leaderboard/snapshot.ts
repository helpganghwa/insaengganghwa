import 'server-only';

import { and, eq, or, gt, isNull, isNotNull, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { meleeBattles } from '@/lib/db/schema/melee';
import { codexChampions } from '@/lib/db/schema/leaderboard';
import { userMilestones } from '@/lib/db/schema/world';
import { milestoneOf } from '@/lib/game/milestone';
import { claimMilestone } from '@/lib/game/leaderboard/incremental';
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
  // 유저별 보유 인스턴스를 json_agg → 앱에서 카탈로그 dedup·최강 선택(pieceCombatPower 단일 진실).
  // keyset 청크(감사 P1) — 전 유저 장비를 한 번에 끌어오면 유저 수 비례로 함수 메모리·전송이
  // 폭증한다(5만 유저 ≈ 수백만 행 JSON). 유저 id 순으로 잘라 배치당 장비만 적재.
  const BATCH = 2000;
  const out: Row[] = [];
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
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
      where p.id > ${after}::uuid
      group by p.id
      order by p.id
      limit ${BATCH}
    `)) as unknown as { id: string; items: [number, number, number][] }[];
    for (const r of rows) {
      out.push({
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
      });
    }
    if (rows.length < BATCH) break;
    after = rows[rows.length - 1]!.id;
  }
  return out;
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

/** 현재 활성 정지 계정 id 집합 — bannedAt 있고 banUntil이 없거나 아직 안 지남(ban.ts와 동일 판정). */
async function activeBannedIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(isNotNull(profiles.bannedAt), or(isNull(profiles.banUntil), gt(profiles.banUntil, sql`now()`))),
    );
  return new Set(rows.map((r) => r.id));
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
  // 정지 계정 제외(감사 2026-07-06) — 밴은 행동만 막고 장비/기록은 남으므로, 필터 없이는
  // 어뷰저를 정지해도 Top100·마일스톤에 계속 노출된다. 활성 정지(bannedAt 있고 banUntil 미도래)를
  // 한 번 조회해 전 메트릭에서 뺀다(계정 정지는 전역이라 서버 무관).
  const banned = await activeBannedIds();
  for (const metric of metrics) {
    const rows = (await ROWS_FN[metric](serverId))
      .filter((r) => !banned.has(r.userId))
      .sort((a, b) => b.value - a.value);
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
    // 전량 delete+insert → 차등 upsert(감사 P1) — 값·순위가 그대로인 행은 no-op이라
    // 5분마다 전 유저 행을 rewrite하던 WAL/bloat이 "실제 변동분"으로 줄어든다.
    // 탈락 행(전 장비 소실·탈퇴 등 — 드묾)만 별도 delete. 두 문 모두 단일 왕복.
    // ⚠ 배열 파라미터는 PG 배열 리터럴 문자열('{a,b,c}')로 전달 — drizzle sql``은 JS 배열을
    // 튜플 ($1,$2,…)로 전개해 `::uuid[]` 캐스트가 구문 오류가 된다(2026-07-07 prod 크론 500 사고).
    // uuid·정수는 콤마/따옴표가 없어 join이 안전.
    const uidArr = `{${ranked.map((r) => r.userId).join(',')}}`;
    const valArr = `{${ranked.map((r) => r.value).join(',')}}`;
    const rkArr = `{${ranked.map((r) => r.rank).join(',')}}`;
    await db.transaction(async (tx) => {
      if (ranked.length > 0) {
        await tx.execute(sql`
          insert into leaderboard_ranks (server_id, metric, user_id, value, rank)
          select ${serverId}, ${metric}, u.user_id, u.value, u.rank
          from unnest(${uidArr}::uuid[], ${valArr}::bigint[], ${rkArr}::int[]) as u(user_id, value, rank)
          on conflict (server_id, metric, user_id) do update
            set value = excluded.value, rank = excluded.rank, updated_at = now()
            where (leaderboard_ranks.value, leaderboard_ranks.rank)
                  is distinct from (excluded.value, excluded.rank)
        `);
      }
      await tx.execute(sql`
        delete from leaderboard_ranks
        where server_id = ${serverId} and metric = ${metric}
          and not (user_id = any(${uidArr}::uuid[]))
      `);
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
    .map((r) => ({ userId: r.userId, value: r.value, mile: milestoneOf(metric, r.value) }))
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
    if (r.mile <= (markBy.get(r.userId) ?? 0)) continue; // 빠른 스킵(대부분)
    // 실제 클레임은 증분 경로(incremental.ts)와 공유하는 원자 조건부 upsert(v2) —
    // 벌크 read 후 쓰기 시점 증분과 경합해도 피드가 정확히 1회만 발화.
    await claimMilestone(r.userId, serverId, metric, r.value).catch((e) =>
      console.warn('[milestone] claim failed', r.userId, (e as Error).message),
    );
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
        from user_equipment ue
        where server_id = ${serverId} and catalog_item_id = ${catalogItemId} and max_enhance_level > 0
          and not exists (
            select 1 from profiles p
            where p.id = ue.user_id and p.banned_at is not null
              and (p.ban_until is null or p.ban_until > now())
          )
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
        from user_equipment ue
        where server_id = ${serverId} and max_enhance_level > 0
          and not exists (
            select 1 from profiles p
            where p.id = ue.user_id and p.banned_at is not null
              and (p.ban_until is null or p.ban_until > now())
          )
      ) t
      where rn <= 3
    `);
  });
}
