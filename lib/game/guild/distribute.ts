import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds, guildMembers, guildTaxDistributions } from '@/lib/db/schema/guild';

import type { GuildTaxDistribution } from './balance';
import { GuildError } from './errors';

/**
 * 길드 세금 풀 분배 — GUILD §5.5. 길드장만. 분배 내역 로그 기록(공개).
 * - equal: 풀을 길드원 N으로 균등(각 floor(pool/N)), 잔여는 풀에 carry.
 * - target: 풀 전액을 특정 길드원에게.
 */
export function distributeGuildTax(input: {
  leaderUserId: string;
  mode: GuildTaxDistribution;
  targetUserId?: string;
}): Promise<{ total: bigint; perMember: bigint | null }> {
  return db.transaction(async (tx) => {
    const [leader] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.leaderUserId))
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
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} + ${pool}` })
        .where(eq(profiles.id, input.targetUserId));
      await tx.update(guilds).set({ taxPoolDiamond: 0n }).where(eq(guilds.id, gid));
      await tx.insert(guildTaxDistributions).values({
        guildId: gid,
        byUserId: input.leaderUserId,
        mode: 'target',
        total: pool,
        targetUserId: input.targetUserId,
      });
      return { total: pool, perMember: null };
    }

    // equal
    const [cnt] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const n = BigInt(cnt?.n ?? 0);
    if (n <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const per = pool / n; // floor
    if (per <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE'); // 풀 < 인원
    const distributed = per * n;

    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${per}` })
      .where(sql`${profiles.id} IN (SELECT user_id FROM guild_members WHERE guild_id = ${gid})`);
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
    return { total: distributed, perMember: per };
  });
}
