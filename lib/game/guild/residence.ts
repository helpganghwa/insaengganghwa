import 'server-only';

import { and, eq, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { markChallengeEvent } from '@/lib/game/challenges/events';
import { characters } from '@/lib/db/schema/server';
import { zones, zoneAdjacency, guildBattleDeployments } from '@/lib/db/schema/guild';
import { walletTrySpend } from '@/lib/game/wallet';

import { RESIDENCE_MOVE_COOLDOWN_MIN, residenceSpeedUpCost } from './balance';
import { isConquestLocked, nextBattleKstDay } from './conquest/schedule';
import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 거주 상태 — 이동 가능 여부 판정에 필요한 값 일체(UI가 그대로 쓴다). */
export type ResidenceState = {
  zoneId: number | null;
  /** 다음 이동 가능 시각(ISO). null=즉시 가능. */
  readyAtIso: string | null;
  /**
   * 지금 구역에 묶어두는 역할 — 이동 자체를 막지는 않고, 이동하면 이게 해제된다.
   * UI가 "무엇이 해제되는지" 경고에 그대로 쓴다.
   */
  lock: { kind: 'executor' | 'deploy'; label: '집행관' | '공격' | '수비' } | null;
};

/** 거주 구역 조회(미배정이면 null). */
export async function getResidence(userId: string, serverId: number): Promise<number | null> {
  const [p] = await db
    .select({ zoneId: characters.residenceZoneId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  return p?.zoneId ?? null;
}

/**
 * 거주 상태 — 구역·쿨타임·잠금을 한 번에. 지도 화면이 이동 버튼 상태를 그리는 데 쓴다.
 * 쿼리 3개를 병렬로 묶어 요청당 왕복을 늘리지 않는다.
 */
export async function getResidenceState(userId: string, serverId: number): Promise<ResidenceState> {
  const [me, dep, exe] = await Promise.all([
    db
      .select({ zoneId: characters.residenceZoneId, readyAt: characters.residenceReadyAt })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
    db
      .select({ zoneId: guildBattleDeployments.zoneId, role: guildBattleDeployments.role })
      .from(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.userId, userId),
          eq(guildBattleDeployments.serverId, serverId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      )
      .limit(1),
    db
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.executorUserId, userId), eq(zones.serverId, serverId)))
      .limit(1),
  ]);
  const readyAt = me[0]?.readyAt ?? null;
  const d = dep[0];
  return {
    zoneId: me[0]?.zoneId ?? null,
    readyAtIso: readyAt && readyAt.getTime() > Date.now() ? readyAt.toISOString() : null,
    lock:
      exe.length > 0
        ? { kind: 'executor', label: '집행관' }
        : d
          ? { kind: 'deploy', label: d.role === 'attack' ? '공격' : '수비' }
          : null,
  };
}

/** 두 구역이 맞닿아 있는지(무방향 — 어느 쪽 컬럼에 있든 인정). */
async function isAdjacent(tx: Tx, a: number, b: number): Promise<boolean> {
  const [row] = await tx
    .select({ x: zoneAdjacency.zoneA })
    .from(zoneAdjacency)
    .where(
      or(
        and(eq(zoneAdjacency.zoneA, a), eq(zoneAdjacency.zoneB, b)),
        and(eq(zoneAdjacency.zoneA, b), eq(zoneAdjacency.zoneB, a)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * 거주 구역 변경 — GUILD §5.5(0139 개편).
 *  ① 인접 구역으로만 (최초 배정 상태에서는 인접 무관 — 아직 살던 곳이 없다)
 *  ② 이동 후 6시간 쿨타임. `paySpeedUp`이면 남은 시간만큼 보석을 받고 즉시 이동
 *  ③ 지금 구역에 배치/집행관으로 묶여 있으면 `release` 없이는 거부. release면 그 역할을 풀고 이동
 *
 * 검사·결제·이동을 한 트랜잭션에 두고 캐릭터 행을 잠근다 — 연타로 쿨타임을 건너뛰거나
 * 보석만 빠져나가는 경우가 없다.
 */
export async function setResidence(
  userId: string,
  serverId: number,
  zoneId: number,
  opts: {
    /** 배치·집행관을 해제하고 이동(유저가 팝업에서 확인한 경우). */
    release?: boolean;
    /** 남은 쿨타임을 보석으로 지불하고 즉시 이동. */
    paySpeedUp?: boolean;
  } = {},
): Promise<{ spent: number; released: '집행관' | '공격' | '수비' | null }> {
  return db.transaction(async (tx) => {
    const [me] = await tx
      .select({ zoneId: characters.residenceZoneId, readyAt: characters.residenceReadyAt })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .for('update');
    if (!me) throw new GuildError('FORBIDDEN');
    const before = me.zoneId;
    if (before === zoneId) return { spent: 0, released: null }; // 같은 구역 — 쿨타임 소모 없이 무시

    const [z] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.id, zoneId), eq(zones.serverId, serverId)))
      .limit(1);
    if (!z) throw new GuildError('ZONE_NOT_FOUND');

    // ① 인접 — 살던 곳이 있을 때만. 최초 배정(before=null)은 어디든 정착 가능.
    if (before != null && !(await isAdjacent(tx, before, zoneId))) {
      throw new GuildError('RESIDENCE_NOT_ADJACENT');
    }

    // ② 구역에 묶여 있는지 — 집행관을 먼저 본다(해제 안내 문구가 다르다).
    let released: '집행관' | '공격' | '수비' | null = null;
    const [exe] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.executorUserId, userId), eq(zones.serverId, serverId)))
      .limit(1);
    const [dep] = await tx
      .select({ id: guildBattleDeployments.id, role: guildBattleDeployments.role })
      .from(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.userId, userId),
          eq(guildBattleDeployments.serverId, serverId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      )
      .limit(1);
    if (exe || dep) {
      if (!opts.release) throw new GuildError(exe ? 'RESIDENCE_LOCKED_EXECUTOR' : 'RESIDENCE_LOCKED_DEPLOY');
      // 해제 = 배치 변경이므로 정산 윈도(23:00~01:00)에는 막는다.
      if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS');
      if (exe) {
        await tx
          .update(zones)
          .set({ executorUserId: null })
          .where(and(eq(zones.executorUserId, userId), eq(zones.serverId, serverId)));
        released = '집행관';
      } else if (dep) {
        await tx
          .delete(guildBattleDeployments)
          .where(eq(guildBattleDeployments.id, dep.id));
        released = dep.role === 'attack' ? '공격' : '수비';
      }
    }

    // ③ 쿨타임 — 남아 있으면 보석으로 지불하거나 거부.
    let spent = 0;
    const remain = me.readyAt ? me.readyAt.getTime() - Date.now() : 0;
    if (remain > 0) {
      if (!opts.paySpeedUp) throw new GuildError('RESIDENCE_COOLDOWN');
      spent = residenceSpeedUpCost(remain);
      const paid = await walletTrySpend(tx, userId, serverId, BigInt(spent));
      if (!paid) throw new GuildError('INSUFFICIENT_DIAMOND');
    }

    await tx
      .update(characters)
      .set({
        residenceZoneId: zoneId,
        // 최초 정착은 이동이 아니므로 쿨타임을 걸지 않는다.
        residenceReadyAt:
          before == null
            ? null
            : sql`now() + ${`${RESIDENCE_MOVE_COOLDOWN_MIN} minutes`}::interval`,
      })
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));

    // 도전 과제(0118) — 기본 배정과 다른 구역으로 '이동'했을 때만 마킹.
    if (before != null) await markChallengeEvent(tx, userId, serverId, 'residence_move');
    return { spent, released };
  });
}

/** 배치·집행관 지정용 거주 검증 — 트랜잭션 내 호출. 그 구역 거주자가 아니면 throw. */
export async function assertResident(
  tx: Tx,
  userId: string,
  serverId: number,
  zoneId: number,
): Promise<void> {
  const [me] = await tx
    .select({ zoneId: characters.residenceZoneId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  if (me?.zoneId !== zoneId) throw new GuildError('NOT_RESIDENT');
}

/**
 * 거주 미배정이면 랜덤 배정(최초 랜덤). 트랜잭션 내 호출. 반환 = 거주 zoneId(구역 0개면 null).
 * profiles 행을 for update로 잠가 동시 배정 레이스 방지.
 */
export async function ensureResidence(tx: Tx, userId: string, serverId: number): Promise<number | null> {
  const [p] = await tx
    .select({ zoneId: characters.residenceZoneId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .for('update');
  if (p?.zoneId) return p.zoneId;
  const [z] = await tx
    .select({ id: zones.id })
    .from(zones)
    .where(eq(zones.serverId, serverId))
    .orderBy(sql`random()`)
    .limit(1);
  if (!z) return null;
  await tx
    .update(characters)
    .set({ residenceZoneId: z.id })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
  return z.id;
}
