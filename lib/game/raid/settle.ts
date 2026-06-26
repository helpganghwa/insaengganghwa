import 'server-only';

import { inArray, and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { raids, raidParticipants, raidRewards } from '@/lib/db/schema/raid';
import { sendPushToUsers } from '@/lib/push/send';
import { aggregatePhaseDrops, raidPhasesCleared } from './drops';
import { RAID_BOSSES } from './bosses';

/**
 * 레이드 정산 — GDD §3.5 / SCHEMA §6.4. 6시간 만료 시 lazy(접속 조회) + cron 일괄.
 * **멱등**: status='active' AND expire_at<=now() 조건부 → 'settled'. 보상 = 1회+ 공격
 * 전원 동일(페이즈 돌파마다 보급 상자, 결정론 추첨 drops.ts). 정산은 raid_rewards 적재만 —
 * 실제 지급은 유저가 레이드 상세에서 직접 수령(`claimRaidReward`, claim.ts).
 */
export async function settleRaid(
  input: { raidId: bigint },
): Promise<{ settled: boolean; phasesCleared: number; rewarded: number }> {
  const { raidId } = input;

  const result = await db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
        serverId: raids.serverId,
        status: raids.status,
        expireAt: raids.expireAt,
        phase1Hp: raids.phase1Hp,
        bossCode: raids.bossCode,
      })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');

    // 멱등 no-op — 없거나 이미 정산됨.
    if (!raid || raid.status !== 'active') {
      return {
        settled: false,
        phasesCleared: 0,
        rewarded: 0,
        winnerIds: [] as string[],
        bossCode: null as null | typeof raid.bossCode,
        serverId: null as number | null,
      };
    }
    if (raid.expireAt.getTime() > Date.now()) {
      return {
        settled: false,
        phasesCleared: 0,
        rewarded: 0,
        winnerIds: [] as string[],
        bossCode: null as null | typeof raid.bossCode,
        serverId: null as number | null,
      }; // 아직 진행 중
    }

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${raidParticipants.totalDamage}), 0)` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId));
    const phasesCleared = raidPhasesCleared(Number(raid.phase1Hp), Number(total));
    const drops = aggregatePhaseDrops(raidId, phasesCleared);

    // 1회 이상 공격한 참여자 전원 동일 보상.
    const winners = await tx
      .select({ userId: raidParticipants.userId })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), gte(raidParticipants.attacksUsed, 1)));

    for (const w of winners) {
      await tx
        .insert(raidRewards)
        .values({
          raidId,
          userId: w.userId,
          // phase_diamond: 페이즈 다이아 드롭 폐지 → 컬럼 default 0 사용(레거시, 미사용).
          boxes: drops.boxes,
        })
        .onConflictDoNothing({ target: [raidRewards.raidId, raidRewards.userId] });
    }

    await tx
      .update(raids)
      .set({ phasesCleared, status: 'settled', settledAt: new Date() })
      .where(and(eq(raids.id, raidId), eq(raids.status, 'active')));

    return {
      settled: true,
      phasesCleared,
      rewarded: winners.length,
      winnerIds: winners.map((w) => w.userId),
      bossCode: raid.bossCode,
      serverId: raid.serverId as number | null,
    };
  });

  // 트랜잭션 커밋 후 푸시 발송(best-effort). 토글·구독 없는 유저는 자동 스킵.
  if (result.settled && (result.winnerIds?.length ?? 0) > 0) {
    const bossName = RAID_BOSSES[result.bossCode!]?.name ?? '보스';
    // 경계규칙 1 — 레이드 서버가 활성(last_server_id)인 참가자에게만 푸시(접속 서버만, 사용자 결정).
    const targets = await db
      .select({ uid: profiles.id })
      .from(profiles)
      .where(
        and(inArray(profiles.id, result.winnerIds!), eq(profiles.lastServerId, result.serverId!)),
      );
    sendPushToUsers(targets.map((t) => t.uid), {
      title: '레이드 종료',
      body: `${bossName} 레이드가 종료되었습니다 — 보상 확인 (페이즈 ${result.phasesCleared}돌파)`,
      url: `/raid/${input.raidId.toString()}`,
      tag: `raid-${input.raidId.toString()}`,
      category: 'raid',
    }).catch((e) => console.warn('[push] raid settle send failed', e));
  }

  return {
    settled: result.settled,
    phasesCleared: result.phasesCleared,
    rewarded: result.rewarded,
  };
}
