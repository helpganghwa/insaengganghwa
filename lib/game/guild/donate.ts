import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { kstDateString } from '@/lib/kst';

import { GUILD_DONATION_TIERS, GUILD_DONATIONS_PER_DAY, guildXpToNext } from './balance';
import { GuildError } from './errors';

/** 누적 XP에 레벨 임계를 차감하며 레벨업 — 수용은 min(50,10+level), 레벨 무제한. */
function applyLevelUp(level: number, xp: bigint): { level: number; xp: bigint } {
  let lv = level;
  let rem = xp;
  while (rem >= BigInt(guildXpToNext(lv))) {
    rem -= BigInt(guildXpToNext(lv));
    lv += 1;
  }
  return { level: lv, xp: rem };
}

/**
 * 길드 기부 — GUILD §2.1. 일 3회(KST 자정 리셋), 회차별 무료/50💎/70XP·100💎/... 체증.
 * 단일 트랜잭션: 일일 카운터 검사 + 💎 차감(유료 회차) + 개인 기여도·길드 XP 가산 + 레벨업.
 */
export function donateToGuild(input: {
  userId: string;
}): Promise<{ tierIndex: number; xp: number; cost: number; level: number }> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({
        guildId: guildMembers.guildId,
        count: guildMembers.dailyDonationCount,
        day: guildMembers.lastDonationKstDay,
      })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.userId))
      .for('update');
    if (!m) throw new GuildError('NOT_IN_GUILD');

    const today = kstDateString();
    const usedToday = m.day === today ? m.count : 0; // 날짜 바뀌면 리셋
    if (usedToday >= GUILD_DONATIONS_PER_DAY) throw new GuildError('DONATION_CAP_REACHED');
    const tier = GUILD_DONATION_TIERS[usedToday]!; // 0=1회차(무료)
    const { cost, xp } = tier;

    if (cost > 0) {
      const [prof] = await tx
        .select({ diamond: profiles.diamond })
        .from(profiles)
        .where(eq(profiles.id, input.userId))
        .for('update');
      if (!prof || prof.diamond < BigInt(cost)) throw new GuildError('INSUFFICIENT_DIAMOND');
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} - ${BigInt(cost)}` })
        .where(eq(profiles.id, input.userId));
    }

    // 개인 기여도 + 일일 카운터.
    await tx
      .update(guildMembers)
      .set({
        contributionPoints: sql`${guildMembers.contributionPoints} + ${xp}`,
        dailyDonationCount: usedToday + 1,
        lastDonationKstDay: today,
      })
      .where(eq(guildMembers.userId, input.userId));

    // 길드 XP + 레벨업.
    const [g] = await tx
      .select({ level: guilds.level, xp: guilds.xp })
      .from(guilds)
      .where(eq(guilds.id, m.guildId))
      .for('update');
    const next = applyLevelUp(g!.level, g!.xp + BigInt(xp));
    await tx
      .update(guilds)
      .set({ level: next.level, xp: next.xp })
      .where(eq(guilds.id, m.guildId));

    return { tierIndex: usedToday, xp, cost, level: next.level };
  });
}
