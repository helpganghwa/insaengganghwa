import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds, zones } from '@/lib/db/schema/guild';

import { GUILD_EXECUTOR_TAX_CUT, TAX_COLLECT_COOLDOWN_MIN } from './balance';
import { GuildError } from './errors';

/**
 * 집행관 세금 수금 — GUILD §5.5. 그 구역 집행관만, 1시간 쿨다운. 구역 누적 💎 →
 * 집행관 10% + 소유 길드 풀 90%. 단일 트랜잭션, 구역 행 for update.
 */
export function collectZoneTax(input: {
  userId: string;
  zoneId: number;
}): Promise<{ executorGain: bigint; guildGain: bigint }> {
  return db.transaction(async (tx) => {
    const [z] = await tx
      .select({
        executor: zones.executorUserId,
        owner: zones.ownerGuildId,
        tax: zones.taxDiamond,
        lastAt: zones.lastTaxCollectedAt,
      })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .for('update');
    if (!z) throw new GuildError('ZONE_NOT_FOUND');
    if (z.executor !== input.userId || !z.owner) throw new GuildError('NOT_EXECUTOR');
    if (
      z.lastAt &&
      Date.now() - z.lastAt.getTime() < TAX_COLLECT_COOLDOWN_MIN * 60_000
    ) {
      throw new GuildError('COLLECT_COOLDOWN');
    }
    const tax = z.tax; // bigint
    if (tax <= 0n) throw new GuildError('NOTHING_TO_COLLECT');

    // 집행관 몫(10%, floor) / 길드 몫(잔여 = 90%+).
    const executorGain = (tax * BigInt(Math.round(GUILD_EXECUTOR_TAX_CUT * 100))) / 100n;
    const guildGain = tax - executorGain;

    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${executorGain}` })
      .where(eq(profiles.id, input.userId));
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} + ${guildGain}` })
      .where(eq(guilds.id, z.owner));
    await tx
      .update(zones)
      .set({ taxDiamond: 0n, lastTaxCollectedAt: sql`now()` })
      .where(eq(zones.id, input.zoneId));

    return { executorGain, guildGain };
  });
}
