import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
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

async function userTotalCP(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<number> {
  // 보유 전체(착용 무관) → 카탈로그별 최강 1개 합산(BALANCE §3.2).
  const owned = await tx
    .select({
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(eq(userEquipment.userId, userId));
  return combatPowerFromOwned(owned);
}

/** 레이드 1회 공격 — 미스 없음·크리 5%/×1.5·뎀 ±30%·캡 없음 (BALANCE §5.3). */
export function attackRaid(input: {
  userId: string;
  raidId: bigint;
}): Promise<{ damage: number; isCrit: boolean; phasesCleared: number }> {
  const { userId, raidId } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
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
      throw new RaidError('RAID_CLOSED');
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

    const totalCP = await userTotalCP(tx, userId);
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

/** 추가 공격 구매 — n번째 비용 50×⌈n/10⌉ 다이아 (10번 단위 계단, BALANCE §5.5). */
export function buyExtraAttack(input: {
  userId: string;
  raidId: bigint;
}): Promise<{ cost: number; extraAttacks: number }> {
  const { userId, raidId } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({ status: raids.status, expireAt: raids.expireAt })
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

    const [prof] = await tx
      .select({ diamond: profiles.diamond })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .for('update');
    if (!prof || prof.diamond < BigInt(cost)) throw new RaidError('INSUFFICIENT_DIAMOND');

    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} - ${BigInt(cost)}` })
      .where(eq(profiles.id, userId));
    await tx
      .update(raidParticipants)
      .set({ extraAttacks: nth })
      .where(eq(raidParticipants.id, part.id));

    return { cost, extraAttacks: nth };
  });
}

/** 보석 공격 — 추가 공격 1회분 보석 차감 + 즉시 공격(단일 트랜잭션). 충전 단계 생략. */
export function gemAttackRaid(input: {
  userId: string;
  raidId: bigint;
}): Promise<{ damage: number; isCrit: boolean; phasesCleared: number; cost: number }> {
  const { userId, raidId } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
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
      throw new RaidError('RAID_CLOSED');
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

    // 보석 결제(추가 공격 1회분) — for update로 다이아 조건부 차감.
    const nth = part.extraAttacks + 1;
    const cost = raidExtraAttackCost(nth);
    const [prof] = await tx
      .select({ diamond: profiles.diamond })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .for('update');
    if (!prof || prof.diamond < BigInt(cost)) throw new RaidError('INSUFFICIENT_DIAMOND');
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} - ${BigInt(cost)}` })
      .where(eq(profiles.id, userId));

    const totalCP = await userTotalCP(tx, userId);
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
