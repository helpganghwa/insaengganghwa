import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { raids, raidParticipants, raidDailyCounts } from '@/lib/db/schema/raid';
import { RAID_DAILY_CAP, RAID_MAX_CONCURRENT_PER_USER } from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';

import { RaidSlots, type ActiveRaid } from './RaidSlots';

export default async function RaidPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [rows, dailyRow] = await Promise.all([
    db
      .select({
        id: raids.id,
        bossCode: raids.bossCode,
        expireAt: raids.expireAt,
        phasesCleared: raids.phasesCleared,
        hostUserId: raids.hostUserId,
      })
      .from(raidParticipants)
      .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
      .where(and(eq(raidParticipants.userId, userId), eq(raids.status, 'active'))),
    db
      .select({ c: raidDailyCounts.startedCount })
      .from(raidDailyCounts)
      .where(
        and(eq(raidDailyCounts.userId, userId), eq(raidDailyCounts.kstDate, kstDateString())),
      )
      .limit(1),
  ]);

  const active: ActiveRaid[] = rows.map((r) => ({
    raidId: r.id.toString(),
    bossCode: r.bossCode,
    expireAtIso: r.expireAt.toISOString(),
    phasesCleared: r.phasesCleared,
    isHost: r.hostUserId === userId,
  }));

  return (
    <div className="px-4 py-4">
      <h1 className="mb-1 text-lg font-semibold">⚔️ 레이드</h1>
      <RaidSlots
        active={active}
        slots={RAID_MAX_CONCURRENT_PER_USER}
        dailyUsed={dailyRow[0]?.c ?? 0}
        dailyCap={RAID_DAILY_CAP}
      />
    </div>
  );
}
