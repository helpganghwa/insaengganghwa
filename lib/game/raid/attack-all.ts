import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids, raidParticipants, raidAttacks } from '@/lib/db/schema/raid';
import { RAID_BASE_ATTACKS, RAID_CRIT_RATE_BP, RAID_DAMAGE_VARIANCE, computeRaidDamage } from '@/lib/game/balance';
import { RaidError } from './open';
import { raidPhasesCleared } from './drops';
import { userTotalCP } from './attack';

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export type RaidAttackAllResult = {
  /** 이번에 쓴 공격 수. */
  count: number;
  /** 이번 공격들의 피해 합. */
  damage: number;
  /** 이번 공격 중 치명타 수. */
  crits: number;
  phasesCleared: number;
  /** 레이드 전체 누적 피해(보스 HP 즉시 반영용 — attackRaid와 같은 계약). */
  totalDamage: string;
};

/**
 * 남은 공격 한 번에(2026-11-24, 문의 #Coa5Gxvt "10번씩 누르기 번거롭다") — 남은 공격 수만큼
 * attackRaid와 **같은 판정을 한 번씩 따로** 굴린다(크리 5%·±30% 분산, BALANCE §5.3). 한 번에 합쳐
 * 굴리지 않으므로 데미지 분포·페이즈 돌파·정산이 한 번씩 누른 것과 같다. 기록도 공격마다 한 줄.
 *
 * 남은 공격 = 기본 10 + 이미 산 추가 공격 − 쓴 공격. 다이아로 **새로 사는** 추가 공격은 포함하지 않는다
 * (다이아 지출은 지금처럼 한 번씩 확인받는다).
 *
 * 멱등: 클릭 의도당 키 1개를 **첫 줄에만** 저장한다(raid_attacks_idem_uq 전역 유니크라 줄마다 못 단다).
 * 같은 키 재요청은 그 줄과 같은 트랜잭션에서 들어간 줄들(created_at = 트랜잭션 시각으로 같다)을
 * 다시 모아 결과로 돌려주고 횟수를 다시 먹지 않는다.
 */
export async function attackRaidAll(input: {
  userId: string;
  raidId: bigint;
  idemKey?: string;
  rng?: () => number;
}): Promise<RaidAttackAllResult> {
  const { userId, raidId } = input;
  let idemKey = input.idemKey;
  const rng = input.rng ?? rngU32;

  const [meta] = await db
    .select({ serverId: raids.serverId, status: raids.status, expireAt: raids.expireAt })
    .from(raids)
    .where(eq(raids.id, raidId))
    .limit(1);
  if (!meta) throw new RaidError('RAID_NOT_FOUND');
  if (meta.status !== 'active' || meta.expireAt.getTime() <= Date.now()) throw new RaidError('RAID_CLOSED');
  const totalCP = await userTotalCP(userId, meta.serverId);

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({ status: raids.status, expireAt: raids.expireAt, phase1Hp: raids.phase1Hp, phasesCleared: raids.phasesCleared })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) throw new RaidError('RAID_CLOSED');

    const [part] = await tx
      .select({ id: raidParticipants.id, attacksUsed: raidParticipants.attacksUsed, extraAttacks: raidParticipants.extraAttacks })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, userId)))
      .for('update');
    if (!part) throw new RaidError('NOT_PARTICIPANT');

    const raidTotal = async () => {
      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${raidParticipants.totalDamage}), 0)` })
        .from(raidParticipants)
        .where(eq(raidParticipants.raidId, raidId));
      return String(total);
    };

    if (idemKey) {
      const [prev] = await tx
        .select({ raidId: raidAttacks.raidId })
        .from(raidAttacks)
        .where(and(eq(raidAttacks.idempotencyKey, idemKey), eq(raidAttacks.userId, userId)))
        .limit(1);
      // 다른 레이드의 키(클라 ref 누수)는 멱등이 아니라 오답 — 버리고 정상 진행, 저장도 안 한다(attackRaid와 같은 규칙).
      if (prev && prev.raidId !== raidId) idemKey = undefined;
      else if (prev) {
        const [agg] = await tx
          .select({
            n: sql<number>`count(*)::int`,
            dmg: sql<string>`coalesce(sum(${raidAttacks.damage}), 0)::text`,
            crits: sql<number>`count(*) filter (where ${raidAttacks.isCrit})::int`,
          })
          .from(raidAttacks)
          .where(and(eq(raidAttacks.raidId, raidId), eq(raidAttacks.userId, userId), 
            // 시각 비교는 SQL 안에서 — JS Date는 밀리초까지라 마이크로초 timestamptz와 같지 않다(테스트로 확인).
            sql`${raidAttacks.createdAt} = (select created_at from raid_attacks where idempotency_key = ${idemKey}::uuid and user_id = ${userId}::uuid limit 1)`,
          ));
        return {
          count: Number(agg?.n ?? 0),
          damage: Number(agg?.dmg ?? 0),
          crits: Number(agg?.crits ?? 0),
          phasesCleared: raid.phasesCleared,
          totalDamage: await raidTotal(),
        };
      }
    }

    const left = RAID_BASE_ATTACKS + part.extraAttacks - part.attacksUsed;
    if (left <= 0) throw new RaidError('NO_ATTACKS');

    const rows: (typeof raidAttacks.$inferInsert)[] = [];
    let sum = 0;
    let crits = 0;
    for (let i = 0; i < left; i++) {
      const isCrit = rng() % 10000 < RAID_CRIT_RATE_BP;
      const u = rng() / 0x1_0000_0000;
      const varFactor = 1 - RAID_DAMAGE_VARIANCE + u * (2 * RAID_DAMAGE_VARIANCE);
      const damage = computeRaidDamage(totalCP, varFactor, isCrit);
      const seq = part.attacksUsed + i + 1;
      sum += damage;
      if (isCrit) crits += 1;
      rows.push({
        raidId,
        userId,
        seq,
        damage: BigInt(damage),
        isCrit,
        isExtra: seq > RAID_BASE_ATTACKS,
        diamondCost: 0n,
        idempotencyKey: i === 0 ? (idemKey ?? null) : null,
      });
    }

    await tx
      .update(raidParticipants)
      .set({ attacksUsed: part.attacksUsed + left, totalDamage: sql`${raidParticipants.totalDamage} + ${BigInt(sum)}` })
      .where(eq(raidParticipants.id, part.id));

    const total = await raidTotal();
    const phasesCleared = raidPhasesCleared(Number(raid.phase1Hp), Number(total));
    if (phasesCleared > raid.phasesCleared) {
      await tx.update(raids).set({ phasesCleared }).where(eq(raids.id, raidId));
    }
    await tx.insert(raidAttacks).values(rows);

    return { count: left, damage: sum, crits, phasesCleared, totalDamage: total };
  });
}
