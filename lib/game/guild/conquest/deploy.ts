import 'server-only';

import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, zones, guildBattleDeployments, zoneAdjacency } from '@/lib/db/schema/guild';

import type { ConquestRole } from '../balance';
import { GuildError } from '../errors';
import { assertGuildPerm } from '../perm-guard';
import { assertResident, setResidenceTx } from '../residence';
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
 *  - 배치하려면 **그 구역 거주자**여야 한다(0139 이동·거주 필수).
 *  - 수비(defend): 자기 길드 소유 구역만. 공격(attack): 자기 길드 **비소유** 구역(중립·적).
 *  - 집행관이 배치하면 그 자동 방어는 **자동 해제**(자리 비움) — "1인=집행관 or 배치" 불변식 유지.
 *  - battle_kst_day는 서버가 결정(23:00 잠금 = 날짜 롤). 기존 배치는 덮어씀(upsert).
 */
export async function deployToZone(input: {
  userId: string;
  serverId: number;
  zoneId: number;
  role: ConquestRole;
  /** 거주 구역이 아니면 함께 이동한다(기존 배치·집행관은 해제). UI에서 확인받은 경우만. */
  move?: boolean;
  /** 이동 쿨타임이 남았으면 보석으로 지불. */
  paySpeedUp?: boolean;
}): Promise<{ battleKstDay: string; spent: number; released: '집행관' | '공격' | '수비' | null }> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도(23:00~01:00) 잠금
  return db.transaction(async (tx) => {
    // 이동+배치를 한 트랜잭션에 — 이동만 되고 배치가 실패해 쿨타임·보석만 날리는 경우를 없앤다.
    let moved: { spent: number; released: '집행관' | '공격' | '수비' | null } = {
      spent: 0,
      released: null,
    };
    if (input.move) {
      moved = await setResidenceTx(tx, input.userId, input.serverId, input.zoneId, {
        release: true,
        paySpeedUp: input.paySpeedUp,
      });
    }
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

    // 이동·거주 필수(0139) — 공격이든 수비든 그 구역에 살아야 배치할 수 있다.
    await assertResident(tx, input.userId, input.serverId, input.zoneId);

    const owned = z.ownerGuildId === m.guildId;
    if (input.role === 'defend' && !owned) throw new GuildError('ZONE_NOT_OWNED');
    if (input.role === 'attack' && owned) throw new GuildError('CANNOT_ATTACK_OWN');
    if (input.role === 'attack') await assertAttackable(tx, m.guildId, input.zoneId);

    // 배치 등록 = 집행관(자동 방어) 자동 해제 — 집행관이 자리를 비우고 다른 구역에 참전(2026-07-26 문의 #90).
    // 집행관 지정이 배치를 지우는 것의 정반대라 "1인=집행관 or 배치" 불변식 유지 → 정산 이중집계 없음.
    // **같은 서버** 스코프(감사 G-01: 타 서버 집행관 오해제 방지). 홈 구역은 집행관·배치가 모두
    // 빠지면 그날 방치 중립화 대상이 된다(neutralizeAbandonedZones) — 다른 수비를 남기지 않으면 상실 위험.
    await tx
      .update(zones)
      .set({ executorUserId: null })
      .where(and(eq(zones.executorUserId, input.userId), eq(zones.serverId, input.serverId)));

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

    return { battleKstDay, ...moved };
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

/**
 * 남의 배치 해제 권한 검증 — deploy 권한(길드장 · 허용된 부길드장, 0142).
 * 본인 배치·해제(deployToZone·cancel)는 이 검사와 무관하다 — 배치는 본인 고유 권한이다.
 */
async function assertLeader(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
): Promise<bigint> {
  const { guildId } = await assertGuildPerm(tx, userId, serverId, 'deploy');
  return guildId;
}

/**
 * 길드원 배치 — GUILD §5.8⑥. deploy 권한자가 길드원 1명을 공격/수비 구역에 배치.
 *  - 대상은 같은 길드원이면서 **그 구역 거주자**여야 한다. 대상이 집행관이면 그 자동 방어는 배치와 함께 자동 해제(자리 비움).
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
    // 이동·거주 필수(0139) — 길드장이 대신 배치해도 거주 규칙은 같다(우회 차단).
    await assertResident(tx, input.targetUserId, input.serverId, input.zoneId);

    // 배치 등록 = 대상의 집행관(자동 방어) 자동 해제(2026-07-26 문의 #90). 같은 서버 스코프(감사 G-01).
    await tx
      .update(zones)
      .set({ executorUserId: null })
      .where(and(eq(zones.executorUserId, input.targetUserId), eq(zones.serverId, input.serverId)));

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
