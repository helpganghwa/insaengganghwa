import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, zones, guildBattleDeployments } from '@/lib/db/schema/guild';

import type { ConquestRole } from '../balance';
import { GuildError } from '../errors';
import { nextBattleKstDay } from './schedule';

/**
 * 점령전 배치 — GUILD §5.8⑥. 다음 전투(KST 12:00)에 공격/수비 1곳 배치. 1인 1배치/일(unique).
 *  - 수비(defend): 자기 길드 소유 구역만. 공격(attack): 자기 길드 **비소유** 구역(중립·적).
 *  - 집행관은 자동 방어로 슬롯 점유 → 배치 불가(IS_EXECUTOR).
 *  - battle_kst_day는 서버가 결정(12:00 잠금 = 날짜 롤). 기존 배치는 덮어씀(upsert).
 */
export async function deployToZone(input: {
  userId: string;
  zoneId: number;
  role: ConquestRole;
}): Promise<{ battleKstDay: string }> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.userId))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');

    const [z] = await tx
      .select({ ownerGuildId: zones.ownerGuildId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    if (!z) throw new GuildError('ZONE_NOT_FOUND');

    const owned = z.ownerGuildId === m.guildId;
    if (input.role === 'defend' && !owned) throw new GuildError('ZONE_NOT_OWNED');
    if (input.role === 'attack' && owned) throw new GuildError('CANNOT_ATTACK_OWN');

    // 집행관은 배치 불가(자동 방어). 어느 구역이든 집행관이면 거부.
    const [executor] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.executorUserId, input.userId))
      .limit(1);
    if (executor) throw new GuildError('IS_EXECUTOR');

    const battleKstDay = nextBattleKstDay();
    await tx
      .insert(guildBattleDeployments)
      .values({ battleKstDay, userId: input.userId, guildId: m.guildId, zoneId: input.zoneId, role: input.role })
      .onConflictDoUpdate({
        target: [guildBattleDeployments.userId, guildBattleDeployments.battleKstDay],
        set: { guildId: m.guildId, zoneId: input.zoneId, role: input.role, createdAt: sql`now()` },
      });

    return { battleKstDay };
  });
}

/** 다음 전투 배치 취소(있으면 삭제). 12:00 이후엔 날짜가 롤되어 오늘 배치는 동결(취소 불가). */
export async function cancelDeployment(input: { userId: string }): Promise<{ cancelled: boolean }> {
  const battleKstDay = nextBattleKstDay();
  const rows = await db
    .delete(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.userId, input.userId),
        eq(guildBattleDeployments.battleKstDay, battleKstDay),
      ),
    )
    .returning({ id: guildBattleDeployments.id });
  return { cancelled: rows.length > 0 };
}

/** 내 다음 전투 배치(없으면 null) — UI 현재 상태 표시용. */
export async function getMyDeployment(
  userId: string,
): Promise<{ zoneId: number; role: ConquestRole; battleKstDay: string } | null> {
  const battleKstDay = nextBattleKstDay();
  const [d] = await db
    .select({ zoneId: guildBattleDeployments.zoneId, role: guildBattleDeployments.role })
    .from(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.userId, userId),
        eq(guildBattleDeployments.battleKstDay, battleKstDay),
      ),
    )
    .limit(1);
  return d ? { zoneId: d.zoneId, role: d.role as ConquestRole, battleKstDay } : null;
}

/** actor가 임원(길드장/부길드장)인지 검증하고 길드 id 반환. */
async function assertOfficer(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<bigint> {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader' && m.role !== 'vice') throw new GuildError('NOT_OFFICER');
  return m.guildId;
}

/**
 * 길드원 배치(임원 전용) — GUILD §5.8⑥. 길드장/부길드장이 길드원 1명을 공격/수비 구역에 배치.
 *  - 대상은 같은 길드원. 집행관은 자동 방어라 배치 불가(IS_EXECUTOR).
 *  - 수비=자기 길드 소유 구역, 공격=비소유 구역. 1인 1배치(upsert), 11:00 잠금(날짜 롤).
 */
export async function deployMember(input: {
  actorUserId: string;
  targetUserId: string;
  zoneId: number;
  role: ConquestRole;
}): Promise<{ battleKstDay: string }> {
  return db.transaction(async (tx) => {
    const guildId = await assertOfficer(tx, input.actorUserId);

    const [target] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.targetUserId))
      .limit(1);
    if (!target || target.guildId !== guildId) throw new GuildError('TARGET_NOT_IN_GUILD');

    const [ex] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.executorUserId, input.targetUserId))
      .limit(1);
    if (ex) throw new GuildError('IS_EXECUTOR');

    const [z] = await tx
      .select({ ownerGuildId: zones.ownerGuildId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    if (!z) throw new GuildError('ZONE_NOT_FOUND');
    const owned = z.ownerGuildId === guildId;
    if (input.role === 'defend' && !owned) throw new GuildError('ZONE_NOT_OWNED');
    if (input.role === 'attack' && owned) throw new GuildError('CANNOT_ATTACK_OWN');

    const battleKstDay = nextBattleKstDay();
    await tx
      .insert(guildBattleDeployments)
      .values({ battleKstDay, userId: input.targetUserId, guildId, zoneId: input.zoneId, role: input.role })
      .onConflictDoUpdate({
        target: [guildBattleDeployments.userId, guildBattleDeployments.battleKstDay],
        set: { guildId, zoneId: input.zoneId, role: input.role, createdAt: sql`now()` },
      });
    return { battleKstDay };
  });
}

/** 길드원 배치 해제(임원 전용) — 자기 길드원 배치만 삭제. */
export async function clearMemberDeployment(input: {
  actorUserId: string;
  targetUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const guildId = await assertOfficer(tx, input.actorUserId);
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

/** 자기 길드의 다음 전투 배치 목록(안개 — 자기 길드만 열람). 구역별 공/수 집계용. */
export async function getMyGuildDeployments(guildId: bigint) {
  const battleKstDay = nextBattleKstDay();
  return db
    .select({
      userId: guildBattleDeployments.userId,
      zoneId: guildBattleDeployments.zoneId,
      role: guildBattleDeployments.role,
    })
    .from(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.guildId, guildId),
        eq(guildBattleDeployments.battleKstDay, battleKstDay),
      ),
    );
}
