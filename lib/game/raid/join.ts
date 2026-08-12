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

    // 크로스서버 참가 차단(2026-07-10 감사 R4, 풀 아이솔레이션) — 참가자가 레이드 서버에
    // 캐릭터가 없으면 거부. 없으면 CP 0으로 참가하고 보상이 캐릭터 없는 서버에 고아 적재된다.
    const [ch] = (await tx.execute(
      sql`select 1 from characters c where c.user_id = ${userId}::uuid and c.server_id = ${raid.serverId} limit 1`,
    )) as unknown as unknown[];
    if (!ch) throw new RaidError('NO_CHARACTER_ON_SERVER');

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

    // ⚠ 순서 주의 — 동시 상한 검사는 bumpDailyOrThrow **뒤에**(open.ts와 같은 이유, 2026-08-11).
    // 레이드 행 FOR UPDATE는 **같은 레이드**로의 참가만 직렬화한다. 한 유저가 서로 다른 레이드에
    // 동시 참가하면 그 락이 안 겹쳐 잠금 없는 activeRaidCount가 전부 통과한다 — 유저별 행을
    // 잠그는 bumpDailyOrThrow 뒤로 옮겨야 직렬화된다.
    await bumpDailyOrThrow(tx, userId, raid.serverId);
    if ((await activeRaidCount(tx, userId)) >= RAID_MAX_CONCURRENT_PER_USER) {
      throw new RaidError('CONCURRENT_LIMIT');
    }

    await tx.insert(raidParticipants).values({ raidId: raid.id, userId });
    return { raidId: raid.id };
  });
}
