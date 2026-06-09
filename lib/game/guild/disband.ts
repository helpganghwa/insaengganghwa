import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, zones } from '@/lib/db/schema/guild';

import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 보유 구역 중립화 + 길드 삭제(멤버 cascade) — GUILD §1 해산.
 * 보유 구역: 소유·영주·점령시각 해제(중립화). 세금 풀은 길드 삭제로 소멸.
 */
export async function neutralizeAndDeleteGuild(tx: Tx, guildId: bigint): Promise<void> {
  await tx
    .update(zones)
    .set({ ownerGuildId: null, lordUserId: null, capturedAt: null })
    .where(eq(zones.ownerGuildId, guildId));
  await tx.delete(guilds).where(eq(guilds.id, guildId)); // guild_members ON DELETE CASCADE
}

/** 길드장 자발 해산 — GUILD §1. 길드장만 가능. */
export function disbandGuild(input: { userId: string }): Promise<void> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(eq(guildMembers.userId, input.userId))
      .for('update');
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader') throw new GuildError('NOT_LEADER');
    await neutralizeAndDeleteGuild(tx, m.guildId);
  });
}
