import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { raids, raidParticipants, raidDailyCounts } from '@/lib/db/schema/raid';
import {
  RAID_DAILY_CAP,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_OPEN_COST_DIAMOND,
  RAID_PHASE1_HP_MAX,
  RAID_PHASE1_HP_MIN,
  RAID_WINDOW_MS,
} from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';
import type { RaidBoss } from './bosses';

export type { RaidBoss };

/** 레이드 — GDD §3.5 / BALANCE §5 / SCHEMA §6. */
export type RaidErrorCode =
  | 'INSUFFICIENT_DIAMOND'
  | 'DAILY_CAP_REACHED'
  | 'CONCURRENT_LIMIT'
  | 'RAID_NOT_FOUND'
  | 'RAID_CLOSED'
  | 'RAID_FULL'
  | 'ALREADY_JOINED'
  | 'NOT_PARTICIPANT'
  | 'NO_ATTACKS'
  | 'NOT_SETTLEABLE'
  | 'REWARD_ALREADY_CLAIMED'
  | 'NOT_HOST'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_SHARED';

export class RaidError extends Error {
  constructor(public code: RaidErrorCode) {
    super(code);
    this.name = 'RaidError';
  }
}


function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
function genShareCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += (rngU32() % 36).toString(36);
  return s;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 동시 진행(active, 호스팅+참여 합산) — host도 participant로 등록되므로 한 쿼리. */
export async function activeRaidCount(tx: Tx, userId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(raidParticipants)
    .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
    .where(and(eq(raidParticipants.userId, userId), eq(raids.status, 'active')));
  return n;
}

/** 일일 한도(KST) 체크 + 증가 (open/join 공통, 호스팅+참여 합산). */
export async function bumpDailyOrThrow(tx: Tx, userId: string, serverId: number) {
  const kstDate = kstDateString();
  const [row] = await tx
    .select({ c: raidDailyCounts.startedCount })
    .from(raidDailyCounts)
    .where(
      and(
        eq(raidDailyCounts.userId, userId),
        eq(raidDailyCounts.serverId, serverId),
        eq(raidDailyCounts.kstDate, kstDate),
      ),
    )
    .for('update');
  if ((row?.c ?? 0) >= RAID_DAILY_CAP) throw new RaidError('DAILY_CAP_REACHED');
  await tx
    .insert(raidDailyCounts)
    .values({ userId, serverId, kstDate, startedCount: 1 })
    .onConflictDoUpdate({
      target: [raidDailyCounts.userId, raidDailyCounts.serverId, raidDailyCounts.kstDate],
      set: { startedCount: sql`${raidDailyCounts.startedCount} + 1` },
    });
}

export type RaidShareMode = 'off' | 'free' | 'approval';

export function openRaid(input: {
  userId: string;
  serverId: number;
  bossCode: RaidBoss;
  friendShare?: RaidShareMode;
  guildShare?: RaidShareMode;
}): Promise<{ raidId: bigint; shareCode: string }> {
  const { userId, bossCode, friendShare = 'off', guildShare = 'off' } = input;

  return db.transaction(async (tx) => {
    if ((await activeRaidCount(tx, userId)) >= RAID_MAX_CONCURRENT_PER_USER) {
      throw new RaidError('CONCURRENT_LIMIT');
    }
    await bumpDailyOrThrow(tx, userId, input.serverId);

    // 개설비 차감 — 서버별 지갑 조건부 UPDATE(부족 시 미차감).
    const paid = await walletTrySpend(tx, userId, input.serverId, RAID_OPEN_COST_DIAMOND);
    if (!paid) throw new RaidError('INSUFFICIENT_DIAMOND');

    const phase1Hp =
      RAID_PHASE1_HP_MIN + (rngU32() % (RAID_PHASE1_HP_MAX - RAID_PHASE1_HP_MIN + 1));
    const now = Date.now();
    const [raid] = await tx
      .insert(raids)
      .values({
        serverId: input.serverId,
        hostUserId: userId,
        bossCode,
        phase1Hp: BigInt(phase1Hp),
        shareCode: genShareCode(),
        expireAt: new Date(now + RAID_WINDOW_MS),
        status: 'active',
        friendShare,
        guildShare,
      })
      .returning({ id: raids.id, shareCode: raids.shareCode });

    await tx.insert(raidParticipants).values({ raidId: raid!.id, userId });

    return { raidId: raid!.id, shareCode: raid!.shareCode };
  });
}
