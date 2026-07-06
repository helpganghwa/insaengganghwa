import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { meleeBattles } from '@/lib/db/schema/melee';
import { milestoneOf } from '@/lib/game/milestone';
import { logWorldEvent } from '@/lib/game/world/event';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';

/**
 * 리더보드 **증분 갱신**(v2, 2026-07-07) — 값 테이블(leaderboard_ranks)을 쓰기 시점에
 * 유저 단위로 갱신한다. 순위는 저장하지 않고 읽기 시 값에서 파생(queries.ts).
 *
 * 설계 원칙:
 *  - 모든 호출은 게임 트랜잭션 **커밋 후 best-effort**(호출부 try/catch) — money path에
 *    쓰기·실패 리스크를 얹지 않는다. 놓친 갱신은 시간별 전체 재계산(snapshot.ts cron)이 교정.
 *  - 값 계산은 스냅샷과 동일한 단일 출처(combatPowerFromOwned·동일 집계 술어) — 두 경로의
 *    결과가 항상 일치해야 하며, 어긋나면 cron 재계산이 진실.
 *  - 밴/탈퇴는 쓰기 시점에 행 삭제(removeUserFromBoards) — 읽기 경로에 밴 조인을 얹지 않는다.
 *  - 마일스톤 워터마크는 조건부 upsert(RETURNING)로 원자 클레임 — 크론 벌크 검사와 공존해도
 *    단조 워터마크라 이중 발화 없음.
 */

type CountMetric = 'raid' | 'melee';

/** 값 upsert — 순위 없이 값만(rank 컬럼은 레거시, 시간별 재계산이 채움). */
async function upsertValue(userId: string, serverId: number, metric: string, value: number): Promise<void> {
  await db.execute(sql`
    insert into leaderboard_ranks (server_id, metric, user_id, value, rank)
    values (${serverId}, ${metric}, ${userId}::uuid, ${value}, 0)
    on conflict (server_id, metric, user_id) do update
      set value = excluded.value, updated_at = now()
      where leaderboard_ranks.value is distinct from excluded.value
  `);
}

/**
 * 마일스톤 워터마크 원자 클레임 — 더 높은 임계로 올라설 때만 1행 반환 → 월드/길드 피드.
 * 증분 경로와 크론 벌크 캐치업(snapshot.ts)이 **공유하는 유일한 클레임 경로** — 조건부
 * upsert(RETURNING)라 두 경로가 경합해도 정확히 1회만 발화한다.
 */
export async function claimMilestone(userId: string, serverId: number, metric: string, value: number): Promise<void> {
  const mile = milestoneOf(metric, value);
  if (mile <= 0) return;
  const claimed = (await db.execute(sql`
    insert into user_milestones (user_id, server_id, metric, milestone)
    values (${userId}::uuid, ${serverId}, ${metric}, ${mile})
    on conflict (user_id, server_id, metric) do update
      set milestone = excluded.milestone, updated_at = now()
      where user_milestones.milestone < excluded.milestone
    returning milestone
  `)) as unknown as { milestone: string }[];
  if (claimed.length === 0) return;
  await logWorldEvent(serverId, 'personal_milestone', { metric, milestone: mile }, { actorUserId: userId });
  await logMemberAchievement(userId, serverId, { action: 'achv_milestone', detail: { metric, milestone: mile } });
}

/**
 * 강화 계열 3메트릭(max·sum·combat) 재계산 — 유저 1명의 장비만 읽으므로(≤카탈로그 수)
 * 호출당 수 ms. 훅: 강화 정산(레벨 변동 시)·보급 개봉(획득/자동초월).
 */
export async function refreshEnhanceMetrics(userId: string, serverId: number): Promise<void> {
  const rows = await db
    .select({
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)));
  if (rows.length === 0) return; // 장비 0 = 보드 미등재(신규) — 첫 개봉 훅이 곧 채움.

  const myMax = rows.reduce((a, r) => Math.max(a, r.enhanceLevel), 0);
  const mySum = rows.reduce((a, r) => a + r.enhanceLevel, 0);
  const myCombat = Math.round(combatPowerFromOwned(rows));

  await Promise.all([
    upsertValue(userId, serverId, 'max', myMax),
    upsertValue(userId, serverId, 'sum', mySum),
    upsertValue(userId, serverId, 'combat', myCombat),
  ]);
  await claimMilestone(userId, serverId, 'sum', mySum);
  await claimMilestone(userId, serverId, 'combat', myCombat);
}

/**
 * 카운트 메트릭 +1 — 레이드 정산(1페이즈+ 돌파 시 공격 1회+ 참가자 전원)·대난투 발표(챔피언).
 * 정산/발표가 조건부 전이로 정확히 1회이므로 커밋 후 1회 호출 = 정확한 증분.
 */
export async function bumpCountMetric(userIds: string[], serverId: number, metric: CountMetric): Promise<void> {
  if (userIds.length === 0) return;
  // ⚠ PG 배열 리터럴 문자열로 전달 — drizzle sql``의 JS 배열은 튜플로 전개됨(snapshot.ts 참조).
  const uidArr = `{${userIds.join(',')}}`;
  const bumped = (await db.execute(sql`
    insert into leaderboard_ranks (server_id, metric, user_id, value, rank)
    select ${serverId}, ${metric}, u, 1, 0 from unnest(${uidArr}::uuid[]) as u
    on conflict (server_id, metric, user_id) do update
      set value = leaderboard_ranks.value + 1, updated_at = now()
    returning user_id::text as user_id, value
  `)) as unknown as { user_id: string; value: string }[];
  for (const b of bumped) {
    await claimMilestone(b.user_id, serverId, metric, Number(b.value)).catch(() => {});
  }
}

/** 유저를 전 보드에서 제거 — 밴·탈퇴 시(읽기 경로에 밴 조인을 두지 않는 대가). 전 서버. */
export async function removeUserFromBoards(userId: string): Promise<void> {
  await db.execute(sql`delete from leaderboard_ranks where user_id = ${userId}::uuid`);
}

/**
 * 유저 전 메트릭 풀 재계산 — 밴 해제 복원용. 강화 3종 + 레이드/대난투 카운트를
 * 스냅샷과 동일 술어로 재산출(유저 1명 스코프라 저비용).
 */
export async function restoreUserBoards(userId: string, serverId: number): Promise<void> {
  await refreshEnhanceMetrics(userId, serverId);
  const [raidCnt] = await db
    .select({ n: sql<number>`count(distinct ${raidParticipants.raidId})::int` })
    .from(raidParticipants)
    .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
    .where(
      and(
        eq(raidParticipants.userId, userId),
        eq(raids.serverId, serverId),
        eq(raids.status, 'settled'),
        sql`${raids.phasesCleared} >= 1`,
        gte(raidParticipants.attacksUsed, 1),
      ),
    );
  const [meleeCnt] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meleeBattles)
    .where(
      and(
        eq(meleeBattles.serverId, serverId),
        eq(meleeBattles.status, 'revealed'),
        eq(meleeBattles.championUserId, userId),
      ),
    );
  if ((raidCnt?.n ?? 0) > 0) await upsertValue(userId, serverId, 'raid', raidCnt!.n);
  if ((meleeCnt?.n ?? 0) > 0) await upsertValue(userId, serverId, 'melee', meleeCnt!.n);
}
