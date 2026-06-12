import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { RAID_MAX_CONCURRENT_PER_USER, RAID_MAX_PARTICIPANTS } from '@/lib/game/balance';
import { RaidError, activeRaidCount, bumpDailyOrThrow } from './open';

/**
 * 레이드 참여 — 공유 링크(shareCode)로 무료 참여. 동시 3·일일 5(호스팅+참여 합산).
 * 최대 10명. 만료/종료된 레이드 참여 불가.
 */
export function joinRaid(input: {
  userId: string;
  shareCode: string;
}): Promise<{ raidId: bigint }> {
  const { userId, shareCode } = input;

  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({ id: raids.id, serverId: raids.serverId, status: raids.status, expireAt: raids.expireAt })
      .from(raids)
      .where(eq(raids.shareCode, shareCode))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED');
    }

    const [existing] = await tx
      .select({ id: raidParticipants.id })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raid.id), eq(raidParticipants.userId, userId)))
      .limit(1);
    if (existing) throw new RaidError('ALREADY_JOINED');

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raid.id));
    if (n >= RAID_MAX_PARTICIPANTS) throw new RaidError('RAID_FULL');

    if ((await activeRaidCount(tx, userId)) >= RAID_MAX_CONCURRENT_PER_USER) {
      throw new RaidError('CONCURRENT_LIMIT');
    }
    await bumpDailyOrThrow(tx, userId, raid.serverId);

    await tx.insert(raidParticipants).values({ raidId: raid.id, userId });
    return { raidId: raid.id };
  });
}
