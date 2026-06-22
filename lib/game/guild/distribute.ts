import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { guilds, guildMembers, guildTaxDistributions } from '@/lib/db/schema/guild';

import type { GuildTaxDistribution } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

/**
 * 길드 세금 풀 분배 — GUILD §5.5. 길드장만. 분배 내역 로그 기록(공개).
 * - equal: 풀을 길드원 N으로 균등(각 floor(pool/N)), 잔여는 풀에 carry.
 * - target: 풀 전액을 특정 길드원에게.
 */
export function distributeGuildTax(input: {
  leaderUserId: string;
  serverId: number;
  mode: GuildTaxDistribution;
  targetUserId?: string;
}): Promise<{ total: bigint; perMember: bigint | null }> {
  return db.transaction(async (tx) => {
    const [leader] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.leaderUserId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');

    const gid = leader.guildId;
    const [g] = await tx
      .select({ pool: guilds.taxPoolDiamond })
      .from(guilds)
      .where(eq(guilds.id, gid))
      .for('update');
    const pool = g!.pool;
    if (pool <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE');

    if (input.mode === 'target') {
      if (!input.targetUserId) throw new GuildError('INVALID_TARGET');
      const [t] = await tx
        .select({ u: guildMembers.userId })
        .from(guildMembers)
        .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.guildId, gid)))
        .limit(1);
      if (!t) throw new GuildError('TARGET_NOT_IN_GUILD');
      await walletAdd(tx, input.targetUserId, input.serverId, pool);
      await tx.update(guilds).set({ taxPoolDiamond: 0n }).where(eq(guilds.id, gid));
      await tx.insert(guildTaxDistributions).values({
        guildId: gid,
        byUserId: input.leaderUserId,
        mode: 'target',
        total: pool,
        targetUserId: input.targetUserId,
      });
      await logGuildAudit(tx, {
        serverId: input.serverId,
        guildId: gid,
        actorUserId: input.leaderUserId,
        action: 'tax_distribute',
        targetUserId: input.targetUserId,
        detail: { amount: pool.toString(), mode: 'target' },
      });
      return { total: pool, perMember: null };
    }

    // equal — 길드원 userId 수집 후 각자 walletAdd. 차감액 = 실제 지급 합계로 일치(💎 증발 방지),
    // 캐릭터 행 부재 멤버가 끼면 walletAdd가 명시 실패→tx 롤백(조용한 유실 대신).
    const members = await tx
      .select({ u: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const n = BigInt(members.length);
    if (n <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const per = pool / n; // floor
    if (per <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE'); // 풀 < 인원
    const distributed = per * n;

    for (const m of members) await walletAdd(tx, m.u, input.serverId, per);
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} - ${distributed}` })
      .where(eq(guilds.id, gid));
    await tx.insert(guildTaxDistributions).values({
      guildId: gid,
      byUserId: input.leaderUserId,
      mode: 'equal',
      total: distributed,
    });
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: gid,
      actorUserId: input.leaderUserId,
      action: 'tax_distribute',
      detail: { amount: distributed.toString(), mode: 'equal' },
    });
    return { total: distributed, perMember: per };
  });
}

/**
 * 길드 세금 풀 수동 분배 — 길드장만. 길드원별 지정 금액(💎)을 각자에게 지급, 총액만큼 풀 차감.
 * 잔여는 풀에 carry. 분배 페이지(입력란)에서 사용.
 */
export function distributeGuildTaxManual(input: {
  leaderUserId: string;
  serverId: number;
  amounts: { userId: string; amount: number }[];
}): Promise<{ total: bigint }> {
  return db.transaction(async (tx) => {
    const [leader] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.leaderUserId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const gid = leader.guildId;

    // 양수·정수만, 같은 유저 합산.
    const byUser = new Map<string, bigint>();
    for (const a of input.amounts) {
      const amt = Math.floor(Number(a.amount));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      byUser.set(a.userId, (byUser.get(a.userId) ?? 0n) + BigInt(amt));
    }
    if (byUser.size === 0) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const total = [...byUser.values()].reduce((s, v) => s + v, 0n);

    const [g] = await tx
      .select({ pool: guilds.taxPoolDiamond })
      .from(guilds)
      .where(eq(guilds.id, gid))
      .for('update');
    if (total > g!.pool) throw new GuildError('DISTRIBUTE_OVER_POOL');

    // 모든 대상이 길드원인지 검증.
    const memberRows = await tx
      .select({ u: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const memberSet = new Set(memberRows.map((r) => r.u));
    for (const uid of byUser.keys()) if (!memberSet.has(uid)) throw new GuildError('TARGET_NOT_IN_GUILD');

    for (const [uid, amt] of byUser) {
      await walletAdd(tx, uid, input.serverId, amt);
    }
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} - ${total}` })
      .where(eq(guilds.id, gid));
    await tx.insert(guildTaxDistributions).values({
      guildId: gid,
      byUserId: input.leaderUserId,
      mode: 'manual',
      total,
    });
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: gid,
      actorUserId: input.leaderUserId,
      action: 'tax_distribute',
      detail: { amount: total.toString(), mode: 'manual' },
    });
    return { total };
  });
}
