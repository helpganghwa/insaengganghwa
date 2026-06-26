import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { userEquipment } from '@/lib/db/schema/equipment';
import { raids, raidParticipants, raidAttacks } from '@/lib/db/schema/raid';
import {
  RAID_BASE_ATTACKS,
  RAID_CRIT_RATE_BP,
  RAID_DAMAGE_VARIANCE,
  computeRaidDamage,
  raidExtraAttackCost,
} from '@/lib/game/balance';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { RaidError } from './open';
import { raidPhasesCleared } from './drops';

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

// CP 계산은 raid 행과 무관(유저 장비 read) → 트랜잭션/락 **밖**에서 db로 계산(감사 S2 — 락 보유 중
// 전 장비 스캔 제거). raid 행 락 보유 시간을 인덱스 ops 몇 개로 단축.
async function userTotalCP(userId: string, serverId: number): Promise<number> {
  // 보유 전체(착용 무관) → 카탈로그별 최강 1개 합산(BALANCE §3.2).
  const owned = await db
    .select({
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)));
  return combatPowerFromOwned(owned);
}

/** 레이드 1회 공격 — 미스 없음·크리 5%/×1.5·뎀 ±30%·캡 없음 (BALANCE §5.3). */
export async function attackRaid(input: {
  userId: string;
  raidId: bigint;
}): Promise<{ damage: number; isCrit: boolean; phasesCleared: number }> {
  const { userId, raidId } = input;

  // 락 밖 — serverId 가벼운 사전조회(비잠금) + CP 계산(유저 장비 스캔). 게이트는 락 내 재확인.
  const [meta] = await db
    .select({ serverId: raids.serverId, status: raids.status, expireAt: raids.expireAt })
    .from(raids)
    .where(eq(raids.id, raidId))
    .limit(1);
  if (!meta) throw new RaidError('RAID_NOT_FOUND');
  if (meta.status !== 'active' || meta.expireAt.getTime() <= Date.now()) {
    throw new RaidError('RAID_CLOSED');
  }
  const totalCP = await userTotalCP(userId, meta.serverId);

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        status: raids.status,
        expireAt: raids.expireAt,
        phase1Hp: raids.phase1Hp,
        phasesCleared: raids.phasesCleared,
      })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED'); // 락 내 재확인(레이스)
    }

    const [part] = await tx
      .select({
        id: raidParticipants.id,
        attacksUsed: raidParticipants.attacksUsed,
        extraAttacks: raidParticipants.extraAttacks,
      })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, userId)))
      .for('update');
    if (!part) throw new RaidError('NOT_PARTICIPANT');

    const allowed = RAID_BASE_ATTACKS + part.extraAttacks;
    if (part.attacksUsed >= allowed) throw new RaidError('NO_ATTACKS');

    const isCrit = rngU32() % 10000 < RAID_CRIT_RATE_BP;
    const u = rngU32() / 0x1_0000_0000; // [0,1)
    const varFactor = 1 - RAID_DAMAGE_VARIANCE + u * (2 * RAID_DAMAGE_VARIANCE);
    const damage = computeRaidDamage(totalCP, varFactor, isCrit);

    const isExtra = part.attacksUsed >= RAID_BASE_ATTACKS;
    await tx
      .update(raidParticipants)
      .set({
        attacksUsed: part.attacksUsed + 1,
        totalDamage: sql`${raidParticipants.totalDamage} + ${BigInt(damage)}`,
      })
      .where(eq(raidParticipants.id, part.id));

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${raidParticipants.totalDamage}), 0)` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId));
    const phasesCleared = raidPhasesCleared(Number(raid.phase1Hp), Number(total));
    if (phasesCleared > raid.phasesCleared) {
      await tx.update(raids).set({ phasesCleared }).where(eq(raids.id, raidId));
    }

    await tx.insert(raidAttacks).values({
      raidId,
      userId,
      seq: part.attacksUsed + 1,
      damage: BigInt(damage),
      isCrit,
      isExtra,
      diamondCost: 0n,
    });

    return { damage, isCrit, phasesCleared };
  });
}

/** 추가 공격 구매 — n번째 비용 25×⌈n/10⌉ 다이아 (10번 단위 계단, BALANCE §5.5). */
export function buyExtraAttack(input: {
  userId: string;
  serverId: number;
  raidId: bigint;
}): Promise<{ cost: number; extraAttacks: number }> {
  const { userId, raidId } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({ serverId: raids.serverId, status: raids.status, expireAt: raids.expireAt })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED');
    }

    const [part] = await tx
      .select({ id: raidParticipants.id, extraAttacks: raidParticipants.extraAttacks })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, userId)))
      .for('update');
    if (!part) throw new RaidError('NOT_PARTICIPANT');

    const nth = part.extraAttacks + 1;
    const cost = raidExtraAttackCost(nth);

    // 결제 서버 = 레이드 서버(트랜잭션 내 조회값). 쿠키 파생 input.serverId를 쓰면 결제 서버를
    // 조작할 수 있어(감사 LOW, 다중서버) raid.serverId로 통일 — CP·보상과 동일 서버로 잠금.
    const paid = await walletTrySpend(tx, userId, raid.serverId, cost);
    if (!paid) throw new RaidError('INSUFFICIENT_DIAMOND');

    await tx
      .update(raidParticipants)
      .set({ extraAttacks: nth })
      .where(eq(raidParticipants.id, part.id));

    return { cost, extraAttacks: nth };
  });
}

/** 보석 공격 — 추가 공격 1회분 보석 차감 + 즉시 공격(단일 트랜잭션). 충전 단계 생략. */
export async function gemAttackRaid(input: {
  userId: string;
  serverId: number;
  raidId: bigint;
}): Promise<{ damage: number; isCrit: boolean; phasesCleared: number; cost: number }> {
  const { userId, raidId } = input;

  // 락 밖 — serverId 사전조회 + CP 계산(감사 S2). 게이트·결제는 락 내 재확인/수행.
  const [meta] = await db
    .select({ serverId: raids.serverId, status: raids.status, expireAt: raids.expireAt })
    .from(raids)
    .where(eq(raids.id, raidId))
    .limit(1);
  if (!meta) throw new RaidError('RAID_NOT_FOUND');
  if (meta.status !== 'active' || meta.expireAt.getTime() <= Date.now()) {
    throw new RaidError('RAID_CLOSED');
  }
  const totalCP = await userTotalCP(userId, meta.serverId);

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        serverId: raids.serverId,
        status: raids.status,
        expireAt: raids.expireAt,
        phase1Hp: raids.phase1Hp,
        phasesCleared: raids.phasesCleared,
      })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED'); // 락 내 재확인(레이스)
    }

    const [part] = await tx
      .select({
        id: raidParticipants.id,
        attacksUsed: raidParticipants.attacksUsed,
        extraAttacks: raidParticipants.extraAttacks,
      })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, userId)))
      .for('update');
    if (!part) throw new RaidError('NOT_PARTICIPANT');

    // 보석 결제(추가 공격 1회분) — for update로 다이아 조건부 차감. 결제 서버 = raid.serverId.
    const nth = part.extraAttacks + 1;
    const cost = raidExtraAttackCost(nth);
    const paid = await walletTrySpend(tx, userId, raid.serverId, cost);
    if (!paid) throw new RaidError('INSUFFICIENT_DIAMOND');

    const isCrit = rngU32() % 10000 < RAID_CRIT_RATE_BP;
    const u = rngU32() / 0x1_0000_0000;
    const varFactor = 1 - RAID_DAMAGE_VARIANCE + u * (2 * RAID_DAMAGE_VARIANCE);
    const damage = computeRaidDamage(totalCP, varFactor, isCrit);

    await tx
      .update(raidParticipants)
      .set({
        extraAttacks: nth,
        attacksUsed: part.attacksUsed + 1,
        totalDamage: sql`${raidParticipants.totalDamage} + ${BigInt(damage)}`,
      })
      .where(eq(raidParticipants.id, part.id));

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${raidParticipants.totalDamage}), 0)` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId));
    const phasesCleared = raidPhasesCleared(Number(raid.phase1Hp), Number(total));
    if (phasesCleared > raid.phasesCleared) {
      await tx.update(raids).set({ phasesCleared }).where(eq(raids.id, raidId));
    }

    await tx.insert(raidAttacks).values({
      raidId,
      userId,
      seq: part.attacksUsed + 1,
      damage: BigInt(damage),
      isCrit,
      isExtra: true,
      diamondCost: BigInt(cost),
    });

    return { damage, isCrit, phasesCleared, cost };
  });
}
