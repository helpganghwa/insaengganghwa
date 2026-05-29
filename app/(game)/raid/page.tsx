import { and, eq, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { raids, raidParticipants, raidDailyCounts } from '@/lib/db/schema/raid';
import {
  RAID_BASE_ATTACKS,
  RAID_DAILY_CAP,
  RAID_MAX_CONCURRENT_PER_USER,
} from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';

import { RaidSlots, type ActiveRaid } from './RaidSlots';

export default async function RaidPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: raids.id,
        bossCode: raids.bossCode,
        expireAt: raids.expireAt,
        phasesCleared: raids.phasesCleared,
        hostUserId: raids.hostUserId,
        myAttacksUsed: raidParticipants.attacksUsed,
        myExtraAttacks: raidParticipants.extraAttacks,
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
    ]),
    3500,
    'raid.page',
  ).catch(() => null);
  const rows = _r?.[0] ?? [];
  const dailyRow = _r?.[1] ?? [];

  // 내 활성 레이드들의 전체 참가자 데미지로 순위 산출.
  // 보통 RAID_MAX_CONCURRENT_PER_USER × 평균 참가자 수라 1 쿼리 batch면 충분.
  const raidIds = rows.map((r) => r.id);
  const allParts = raidIds.length
    ? await withTimeout(
        db
          .select({
            raidId: raidParticipants.raidId,
            userId: raidParticipants.userId,
            totalDamage: raidParticipants.totalDamage,
          })
          .from(raidParticipants)
          .where(inArray(raidParticipants.raidId, raidIds)),
        3500,
        'raid.participants',
      ).catch(() => [] as { raidId: bigint; userId: string; totalDamage: bigint }[])
    : [];
  const partsByRaid = new Map<string, { userId: string; totalDamage: bigint }[]>();
  for (const p of allParts) {
    const key = p.raidId.toString();
    const arr = partsByRaid.get(key);
    if (arr) arr.push({ userId: p.userId, totalDamage: p.totalDamage });
    else partsByRaid.set(key, [{ userId: p.userId, totalDamage: p.totalDamage }]);
  }

  const active: ActiveRaid[] = rows.map((r) => {
    const parts = partsByRaid.get(r.id.toString()) ?? [];
    // totalDamage desc 정렬 후 내 위치. 동점은 안정정렬(입장 순) — 표시용이라 충분.
    parts.sort((a, b) => (a.totalDamage < b.totalDamage ? 1 : a.totalDamage > b.totalDamage ? -1 : 0));
    const myRank = Math.max(1, parts.findIndex((p) => p.userId === userId) + 1);
    return {
      raidId: r.id.toString(),
      bossCode: r.bossCode,
      expireAtIso: r.expireAt.toISOString(),
      phasesCleared: r.phasesCleared,
      isHost: r.hostUserId === userId,
      attacksLeft: RAID_BASE_ATTACKS + r.myExtraAttacks - r.myAttacksUsed,
      myRank,
      participantCount: parts.length,
    };
  });

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
