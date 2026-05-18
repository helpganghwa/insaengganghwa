import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { raids, raidParticipants } from '@/lib/db/schema/raid';
import { raidPhasesCleared } from '@/lib/game/raid';

import { settleRaidAction } from '../actions';
import { RaidSessionCard, type RaidView } from '../RaidSessionCard';

export default async function RaidDetail({
  params,
}: {
  params: Promise<{ raidId: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { raidId } = await params;

  async function loadRaid() {
    const [r] = await db
      .select({
        id: raids.id,
        bossCode: raids.bossCode,
        phase1Hp: raids.phase1Hp,
        shareCode: raids.shareCode,
        expireAt: raids.expireAt,
        status: raids.status,
        hostUserId: raids.hostUserId,
      })
      .from(raids)
      .where(eq(raids.id, BigInt(raidId)))
      .limit(1);
    return r;
  }

  let raid = await loadRaid();
  if (!raid) notFound();
  // 만료된 active → lazy 정산(멱등) 후 재조회.
  if (raid.status === 'active' && raid.expireAt.getTime() <= Date.now()) {
    await settleRaidAction(raidId);
    raid = (await loadRaid())!;
  }

  const parts = await db
    .select({
      userId: raidParticipants.userId,
      totalDamage: raidParticipants.totalDamage,
      attacksUsed: raidParticipants.attacksUsed,
      extraAttacks: raidParticipants.extraAttacks,
      nickname: profiles.nickname,
    })
    .from(raidParticipants)
    .innerJoin(profiles, eq(profiles.id, raidParticipants.userId))
    .where(eq(raidParticipants.raidId, BigInt(raidId)));

  const total = parts.reduce((s, p) => s + Number(p.totalDamage), 0);
  const me = parts.find((p) => p.userId === userId) ?? null;

  const view: RaidView = {
    raidId,
    bossCode: raid.bossCode,
    status: raid.status,
    expireAtIso: raid.expireAt.toISOString(),
    shareCode: raid.shareCode,
    isHost: raid.hostUserId === userId,
    phase1Hp: Number(raid.phase1Hp),
    totalDamage: total,
    phasesCleared: raidPhasesCleared(Number(raid.phase1Hp), total),
    isParticipant: !!me,
    myAttacksUsed: me?.attacksUsed ?? 0,
    myExtraAttacks: me?.extraAttacks ?? 0,
    participants: parts
      .map((p) => ({
        nickname: p.nickname,
        totalDamage: Number(p.totalDamage),
        isMe: p.userId === userId,
      }))
      .sort((a, b) => b.totalDamage - a.totalDamage),
  };

  return (
    <div className="pb-4">
      <RaidSessionCard view={view} />
    </div>
  );
}
