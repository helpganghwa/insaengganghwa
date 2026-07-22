import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { milestoneOf } from '@/lib/game/milestone';
import { logWorldEvent } from '@/lib/game/world/event';
import { sendMilestoneMail } from '@/lib/game/milestone-mail';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { meleeDecayedPointsSumSql } from '@/lib/game/melee/points';

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
 *  - **유저 단위 advisory 락**(lockUser) — 같은 유저의 동시 훅(두 슬롯 동시 정산의
 *    read-then-write 덮어쓰기), 신규삽입 recount와 동시 +1의 이중가산, 밴 제거와 증분의
 *    TOCTOU(유령 재등장)를 전부 직렬화로 제거(2026-07-07 전수감사 C-묶음).
 *  - 마일스톤 워터마크는 조건부 upsert(RETURNING)로 원자 클레임 — 크론 벌크 검사와 공존해도
 *    단조 워터마크라 이중 발화 없음.
 */

type CountMetric = 'raid' | 'melee';
type Dbx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 같은 유저의 리더보드 쓰기(증분·recount·밴 제거)를 tx 스코프에서 직렬화. */
function lockUser(tx: Dbx, userId: string): Promise<unknown> {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('lb:' || ${userId}, 0))`);
}

/** 활성 밴 여부 — lockUser 획득 후 호출하면 removeUserFromBoards와 직렬화되어 TOCTOU 없음. */
async function isActivelyBanned(dbx: Dbx, userId: string): Promise<boolean> {
  const [r] = (await dbx.execute(sql`
    select 1 from profiles
    where id = ${userId}::uuid and banned_at is not null
      and (ban_until is null or ban_until > now())
    limit 1
  `)) as unknown as unknown[];
  return !!r;
}

/** 값 upsert — 순위 없이 값만(rank 컬럼은 레거시, 시간별 재계산이 채움). */
async function upsertValue(
  dbx: Dbx,
  userId: string,
  serverId: number,
  metric: string,
  value: number,
): Promise<void> {
  await dbx.execute(sql`
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
 * ⚠ 워터마크 전진과 피드 발화는 비원자 — upsert 직후 프로세스가 죽으면 그 임계의 피드는
 * 영구 미발화(단조 워터마크라 재발화 없음). 이중 발화(스팸)보다 드문 유실을 택한
 * 의도적 트레이드오프(피드는 연출용, 보상 아님).
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
  // 이정표 보상 우편(2026-07-15) — 피드 발화와 1:1. 워터마크가 1회를 보장.
  await sendMilestoneMail(userId, serverId, metric as 'sum' | 'combat' | 'raid' | 'melee', mile);
}

/**
 * 강화 계열 3메트릭(max·sum·combat) 재계산 — 유저 1명의 장비만 읽으므로(≤카탈로그 수)
 * 호출당 수 ms. 훅: 강화 정산(레벨 변동 시)·보급 개봉(획득/자동초월).
 * 읽기→쓰기 전체를 lockUser tx로 감싸 동시 훅의 낡은 합계 덮어쓰기(lost update)를 제거.
 */
export async function refreshEnhanceMetrics(userId: string, serverId: number): Promise<void> {
  const done = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    // 밴 가드 — 락 안 판정이라 removeUserFromBoards와 직렬화(유령 재등장 방지).
    if (await isActivelyBanned(tx, userId)) return null;
    const rows = await tx
      .select({
        catalogItemId: userEquipment.catalogItemId,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)));
    if (rows.length === 0) return null; // 장비 0 = 보드 미등재(신규) — 첫 개봉 훅이 곧 채움.

    const myMax = rows.reduce((a, r) => Math.max(a, r.enhanceLevel), 0);
    const mySum = rows.reduce((a, r) => a + r.enhanceLevel, 0);
    const myCombat = Math.round(combatPowerFromOwned(rows));
    await upsertValue(tx, userId, serverId, 'max', myMax);
    await upsertValue(tx, userId, serverId, 'sum', mySum);
    await upsertValue(tx, userId, serverId, 'combat', myCombat);
    return { mySum, myCombat };
  });
  if (!done) return;
  // 피드 발화는 커밋 후(락 밖) — 외부 파급을 락 보유 시간에 얹지 않는다.
  await claimMilestone(userId, serverId, 'sum', done.mySum);
  await claimMilestone(userId, serverId, 'combat', done.myCombat);
}

/**
 * 카운트 메트릭 +1 — 레이드 정산(1페이즈+ 돌파 시 공격 1회+ 참가자 전원)·대난투 발표(챔피언).
 * 정산/발표가 조건부 전이로 정확히 1회이므로 커밋 후 1회 호출 = 정확한 증분.
 * 유저별 lockUser tx — 신규삽입(xmax=0) recount와 동시 +1의 이중가산·밴 TOCTOU 제거.
 * (참가자 수십 명 스케일의 커밋 후 best-effort 경로라 유저별 왕복 비용 허용.)
 */
export async function bumpCountMetric(userIds: string[], serverId: number, metric: CountMetric): Promise<void> {
  for (const userId of new Set(userIds)) {
    try {
      const value = await db.transaction(async (tx) => {
        await lockUser(tx, userId);
        if (await isActivelyBanned(tx, userId)) return null;
        // xmax=0 = 이번에 insert된 행 — 행 부재 상태의 +1은 통산 이력을 모르는 value 1이므로
        // (밴 해제 직후 등) 신규 삽입분만 원천 테이블 재계산으로 교정(락 안이라 정확).
        const [b] = (await tx.execute(sql`
          insert into leaderboard_ranks (server_id, metric, user_id, value, rank)
          values (${serverId}, ${metric}, ${userId}::uuid, 1, 0)
          on conflict (server_id, metric, user_id) do update
            set value = leaderboard_ranks.value + 1, updated_at = now()
          returning value, (xmax = 0) as inserted
        `)) as unknown as { value: string; inserted: boolean }[];
        if (!b) return null;
        let v = Number(b.value);
        if (b.inserted) {
          const recounted = await recountCountMetric(tx, userId, serverId, metric);
          if (recounted !== v) {
            await upsertValue(tx, userId, serverId, metric, recounted);
            v = recounted;
          }
        }
        return v;
      });
      if (value != null) await claimMilestone(userId, serverId, metric, value).catch(() => {});
    } catch (e) {
      console.warn('[lb.bump]', metric, userId, e);
    }
  }
}

/**
 * 대난투 포인트 적립(2026-07-22) — 발표 시 참가자 전원, 유저별 가변 포인트 +.
 * bumpCountMetric와 동일한 락·신규삽입 recount 교정 구조. 마일스톤은 호출하지 않음 —
 * melee 마일스톤은 '우승 횟수' 기반으로 reveal에서 별도 클레임(포인트 오발화 차단).
 * 감쇠(반감기 14일)와의 정합: 발표일 포인트는 가중치 1.0이라 원포인트 +p가 정확하고,
 * 기존 값의 감쇠 진행분은 매시 스냅샷 재계산이 흡수한다(증분은 항상 상한 근사 — 낙관 오차
 * 는 최대 1시간 내 교정).
 */
export async function bumpMeleePoints(
  entries: { userId: string; points: number }[],
  serverId: number,
): Promise<void> {
  for (const { userId, points } of entries) {
    if (points <= 0) continue;
    try {
      await db.transaction(async (tx) => {
        await lockUser(tx, userId);
        if (await isActivelyBanned(tx, userId)) return;
        const [b] = (await tx.execute(sql`
          insert into leaderboard_ranks (server_id, metric, user_id, value, rank)
          values (${serverId}, 'melee', ${userId}::uuid, ${points}, 0)
          on conflict (server_id, metric, user_id) do update
            set value = leaderboard_ranks.value + ${points}, updated_at = now()
          returning value, (xmax = 0) as inserted
        `)) as unknown as { value: string; inserted: boolean }[];
        // 신규 삽입(통산 이력 미반영) 또는 우승수→포인트 전환기 값 잔존 가능 — 원천 재계산 교정.
        if (b?.inserted) {
          const recounted = await recountCountMetric(tx, userId, serverId, 'melee');
          if (recounted !== Number(b.value)) await upsertValue(tx, userId, serverId, 'melee', recounted);
        }
      });
    } catch (e) {
      console.warn('[lb.meleePoints]', userId, e);
    }
  }
}

/** 카운트 메트릭 원천 재계산 — 스냅샷과 동일 술어(유저 1명 스코프). */
async function recountCountMetric(
  dbx: Dbx,
  userId: string,
  serverId: number,
  metric: CountMetric,
): Promise<number> {
  if (metric === 'raid') {
    const [r] = await dbx
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
    return r?.n ?? 0;
  }
  // melee = 감쇠 포인트(반감기 14일, 2026-07-22) — Σ(구간 포인트 × 0.5^(경과일/14)).
  // 집계식은 MELEE_REWARD_TIERS 단일 출처에서 생성(points.ts) — 스냅샷과 결과 항상 일치.
  const rows = (await dbx.execute(sql`
    select ${sql.raw(meleeDecayedPointsSumSql('mp.final_rank', 'pc.n', 'mb.battle_date'))} as n
    from melee_participants mp
    join melee_battles mb on mb.id = mp.battle_id
    join (select battle_id, count(*)::int as n from melee_participants group by battle_id) pc
      on pc.battle_id = mp.battle_id
    where mp.user_id = ${userId}::uuid and mb.server_id = ${serverId} and mb.status = 'revealed'
  `)) as unknown as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

/**
 * 유저를 전 보드에서 제거 — 밴·탈퇴 시(읽기 경로에 밴 조인을 두지 않는 대가). 전 서버.
 * codex_champions(아이템 챔피언)도 함께 — 시간별 rebuild 전까지 밴 어뷰저가 해방 등수로
 * 노출되던 최대 1h 창 폐쇄(2026-07-07 전수감사 C-묶음). lockUser로 증분 훅과 직렬화.
 */
export async function removeUserFromBoards(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx.execute(sql`delete from leaderboard_ranks where user_id = ${userId}::uuid`);
    await tx.execute(sql`delete from codex_champions where user_id = ${userId}::uuid`);
  });
}

/**
 * 유저 전 메트릭 풀 재계산 — 밴 해제 복원용. 강화 3종 + 레이드/대난투 카운트를
 * 스냅샷과 동일 술어로 재산출(유저 1명 스코프라 저비용).
 */
export async function restoreUserBoards(userId: string, serverId: number): Promise<void> {
  await refreshEnhanceMetrics(userId, serverId);
  const raidCnt = await recountCountMetric(db, userId, serverId, 'raid');
  const meleeCnt = await recountCountMetric(db, userId, serverId, 'melee');
  if (raidCnt > 0) await upsertValue(db, userId, serverId, 'raid', raidCnt);
  if (meleeCnt > 0) await upsertValue(db, userId, serverId, 'melee', meleeCnt);
}
