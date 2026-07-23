import 'server-only';

import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, zones, guildBattleDeployments, zoneAdjacency } from '@/lib/db/schema/guild';

import type { ConquestRole } from '../balance';
import { GuildError } from '../errors';
import { nextBattleKstDay, isConquestLocked } from './schedule';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 공격 인접 규칙 — 길드가 소유한 구역에 인접한 구역만 공격 가능.
 *  단, 소유 구역이 0개면 어디든 첫 상륙 가능(부트스트랩). 수비는 인접 무관(이미 소유).
 *  중립 구역(소유 없음)은 인접 무관 공격 가능(B안 — 방치 중립화 개방).
 */
async function assertAttackable(tx: Tx, guildId: bigint, targetZoneId: number): Promise<void> {
  const owned = await tx.select({ id: zones.id }).from(zones).where(eq(zones.ownerGuildId, guildId));
  if (owned.length === 0) return; // 영토 0개 — 첫 상륙 자유
  // 대상이 중립 구역이면 인접 조건 면제.
  const [tz] = await tx.select({ owner: zones.ownerGuildId }).from(zones).where(eq(zones.id, targetZoneId)).limit(1);
  if (tz && tz.owner === null) return; // 중립 — 자유공격
  const ownedIds = owned.map((o) => o.id);
  const [adj] = await tx
    .select({ a: zoneAdjacency.zoneA })
    .from(zoneAdjacency)
    .where(
      or(
        and(eq(zoneAdjacency.zoneA, targetZoneId), inArray(zoneAdjacency.zoneB, ownedIds)),
        and(eq(zoneAdjacency.zoneB, targetZoneId), inArray(zoneAdjacency.zoneA, ownedIds)),
      ),
    )
    .limit(1);
  if (!adj) throw new GuildError('NOT_ADJACENT');
}

/**
 * 점령전 배치 — GUILD §5.8⑥. 다음 전투(KST 23:00)에 공격/수비 1곳 배치. 1인 1배치/일(unique).
 *  - 수비(defend): 자기 길드 소유 구역만. 공격(attack): 자기 길드 **비소유** 구역(중립·적).
 *  - 집행관은 자동 방어로 슬롯 점유 → 배치 불가(IS_EXECUTOR).
 *  - battle_kst_day는 서버가 결정(23:00 잠금 = 날짜 롤). 기존 배치는 덮어씀(upsert).
 */
export async function deployToZone(input: {
  userId: string;
  serverId: number;
  zoneId: number;
  role: ConquestRole;
}): Promise<{ battleKstDay: string }> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도(23:00~01:00) 잠금
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');

    const [z] = await tx
      .select({ ownerGuildId: zones.ownerGuildId, serverId: zones.serverId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    if (!z || z.serverId !== input.serverId) throw new GuildError('ZONE_NOT_FOUND'); // 타 서버 존 차단

    const owned = z.ownerGuildId === m.guildId;
    if (input.role === 'defend' && !owned) throw new GuildError('ZONE_NOT_OWNED');
    if (input.role === 'attack' && owned) throw new GuildError('CANNOT_ATTACK_OWN');
    if (input.role === 'attack') await assertAttackable(tx, m.guildId, input.zoneId);

    // 집행관은 배치 불가(자동 방어). **같은 서버** 어느 구역이든 집행관이면 거부(감사 G-01:
    // serverId 누락 시 타 서버 집행관이 이 서버 배치를 오차단).
    const [executor] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.executorUserId, input.userId), eq(zones.serverId, input.serverId)))
      .limit(1);
    if (executor) throw new GuildError('IS_EXECUTOR');

    const battleKstDay = nextBattleKstDay();
    await tx
      .insert(guildBattleDeployments)
      .values({
        battleKstDay,
        userId: input.userId,
        serverId: input.serverId,
        guildId: m.guildId,
        zoneId: input.zoneId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [
          guildBattleDeployments.userId,
          guildBattleDeployments.serverId,
          guildBattleDeployments.battleKstDay,
        ],
        set: { guildId: m.guildId, zoneId: input.zoneId, role: input.role, createdAt: sql`now()` },
      });

    return { battleKstDay };
  });
}

/** 다음 전투 배치 취소(있으면 삭제). 23:00 이후엔 날짜가 롤되어 오늘 배치는 동결(취소 불가). */
export async function cancelDeployment(input: { userId: string; serverId: number }): Promise<{ cancelled: boolean }> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도 잠금
  const battleKstDay = nextBattleKstDay();
  const rows = await db
    .delete(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.userId, input.userId),
        eq(guildBattleDeployments.serverId, input.serverId),
        eq(guildBattleDeployments.battleKstDay, battleKstDay),
      ),
    )
    .returning({ id: guildBattleDeployments.id });
  return { cancelled: rows.length > 0 };
}

/** 내 다음 전투 배치(없으면 null) — UI 현재 상태 표시용. */
export async function getMyDeployment(
  userId: string,
  serverId: number,
): Promise<{ zoneId: number; role: ConquestRole; battleKstDay: string } | null> {
  const battleKstDay = nextBattleKstDay();
  const [d] = await db
    .select({ zoneId: guildBattleDeployments.zoneId, role: guildBattleDeployments.role })
    .from(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.userId, userId),
        eq(guildBattleDeployments.serverId, serverId),
        eq(guildBattleDeployments.battleKstDay, battleKstDay),
      ),
    )
    .limit(1);
  return d ? { zoneId: d.zoneId, role: d.role as ConquestRole, battleKstDay } : null;
}

/** actor가 길드장인지 검증하고 길드 id 반환 — 남 배치/해제는 **길드장 전속**(2026-07-10 권한 조정). */
async function assertLeader(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
): Promise<bigint> {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader') throw new GuildError('NOT_LEADER');
  return m.guildId;
}

/**
 * 길드원 배치(길드장 전용) — GUILD §5.8⑥. 길드장이 길드원 1명을 공격/수비 구역에 배치.
 *  - 대상은 같은 길드원. 집행관은 자동 방어라 배치 불가(IS_EXECUTOR).
 *  - 수비=자기 길드 소유 구역, 공격=비소유 구역. 1인 1배치(upsert), 23:00 잠금(날짜 롤).
 */
export async function deployMember(input: {
  actorUserId: string;
  serverId: number;
  targetUserId: string;
  zoneId: number;
  role: ConquestRole;
}): Promise<{ battleKstDay: string }> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도 잠금
  return db.transaction(async (tx) => {
    const guildId = await assertLeader(tx, input.actorUserId, input.serverId);

    const [target] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)))
      .limit(1);
    if (!target || target.guildId !== guildId) throw new GuildError('TARGET_NOT_IN_GUILD');

    // 같은 서버 집행관이면 배치 불가(감사 G-01: serverId 스코프).
    const [ex] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.executorUserId, input.targetUserId), eq(zones.serverId, input.serverId)))
      .limit(1);
    if (ex) throw new GuildError('IS_EXECUTOR');

    const [z] = await tx
      .select({ ownerGuildId: zones.ownerGuildId, serverId: zones.serverId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    if (!z || z.serverId !== input.serverId) throw new GuildError('ZONE_NOT_FOUND'); // 타 서버 존 차단
    const owned = z.ownerGuildId === guildId;
    if (input.role === 'defend' && !owned) throw new GuildError('ZONE_NOT_OWNED');
    if (input.role === 'attack' && owned) throw new GuildError('CANNOT_ATTACK_OWN');
    if (input.role === 'attack') await assertAttackable(tx, guildId, input.zoneId);

    const battleKstDay = nextBattleKstDay();
    await tx
      .insert(guildBattleDeployments)
      .values({
        battleKstDay,
        userId: input.targetUserId,
        serverId: input.serverId,
        guildId,
        zoneId: input.zoneId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [
          guildBattleDeployments.userId,
          guildBattleDeployments.serverId,
          guildBattleDeployments.battleKstDay,
        ],
        set: { guildId, zoneId: input.zoneId, role: input.role, createdAt: sql`now()` },
      });
    return { battleKstDay };
  });
}

/** 길드원 배치 해제(임원 전용) — 자기 길드원 배치만 삭제. */
export async function clearMemberDeployment(input: {
  actorUserId: string;
  serverId: number;
  targetUserId: string;
}): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도 잠금
  await db.transaction(async (tx) => {
    const guildId = await assertLeader(tx, input.actorUserId, input.serverId);
    await tx
      .delete(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.userId, input.targetUserId),
          eq(guildBattleDeployments.guildId, guildId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      );
  });
}
