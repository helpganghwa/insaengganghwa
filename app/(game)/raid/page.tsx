import Link from 'next/link';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { raids, raidParticipants, raidRewards, raidDailyCounts } from '@/lib/db/schema/raid';
import {
  RAID_BASE_ATTACKS,
  RAID_DAILY_CAP,
  RAID_MAX_CONCURRENT_PER_USER,
} from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';
import { RAID_BOSSES, type RaidBoss } from '@/lib/game/raid/bosses';
import { BossSprite } from '@/components/BossSprite';

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
    // 정산 완료(status='settled')되었지만 미수령(claimed_at IS NULL)인 내 보상.
    // 홈 hub 뱃지(raid_rewards.claimed_at IS NULL 카운트)와 동일 기준 — 뱃지 1이면
    // 여기 1행 노출돼야 사용자가 진입해서 수령 가능(2026-05-31 사용자 버그 리포트).
    db
      .select({
        raidId: raidRewards.raidId,
        bossCode: raids.bossCode,
        baseDiamond: raidRewards.baseDiamond,
        phaseDiamond: raidRewards.phaseDiamond,
        boxes: raidRewards.boxes,
      })
      .from(raidRewards)
      .innerJoin(raids, eq(raids.id, raidRewards.raidId))
      .where(and(eq(raidRewards.userId, userId), isNull(raidRewards.claimedAt))),
    ]),
    3500,
    'raid.page',
  ).catch(() => null);
  const rows = _r?.[0] ?? [];
  const dailyRow = _r?.[1] ?? [];
  const pendingClaims = _r?.[2] ?? [];

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

      {/* 정산 대기 보상 — 정산 완료 후 미수령. 상세 화면에서 수령. */}
      {pendingClaims.length > 0 ? (
        <section className="mb-3 space-y-2">
          <h2 className="text-[11px] font-semibold tracking-wide text-amber-500">
            ⚡ 정산 대기 보상
          </h2>
          {pendingClaims.map((p) => {
            const diamond = Number(p.baseDiamond) + Number(p.phaseDiamond);
            const boxTotal = (p.boxes.weapon ?? 0) + (p.boxes.armor ?? 0) + (p.boxes.accessory ?? 0);
            return (
              <Link
                key={p.raidId.toString()}
                href={`/raid/${p.raidId}`}
                className="flex items-center gap-3 rounded-xl border-2 border-amber-500/70 bg-amber-50 p-3 text-zinc-900 transition active:scale-[0.99] dark:bg-amber-950/40 dark:text-amber-50"
              >
                <div className="shrink-0">
                  <BossSprite code={p.bossCode as RaidBoss} size={48} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{RAID_BOSSES[p.bossCode as RaidBoss].name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-amber-700 dark:text-amber-200">
                    {diamond > 0 ? <span>💎 {diamond.toLocaleString('ko-KR')}</span> : null}
                    {boxTotal > 0 ? <span>📦 {boxTotal}</span> : null}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-amber-950">
                  수령 →
                </span>
              </Link>
            );
          })}
        </section>
      ) : null}

      <RaidSlots
        active={active}
        slots={RAID_MAX_CONCURRENT_PER_USER}
        dailyUsed={dailyRow[0]?.c ?? 0}
        dailyCap={RAID_DAILY_CAP}
      />
    </div>
  );
}
