import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids, raidParticipants, raidDailyCounts, raidJoinRequests, raidInvites } from '@/lib/db/schema/raid';
import { walletAdd } from '@/lib/game/wallet';
import { RAID_LEAVE_WINDOW_MS } from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';

import { RaidError } from './open';

/**
 * 레이드 취소(2026-11-16, docs/RAID.md — 규칙은 11-10 사용자 확정).
 *
 * - 참여 취소: 남이 소환한 레이드에서, 참여한 뒤 RAID_LEAVE_WINDOW_MS(10분) 안·공격 0회·진행 중일 때.
 *   참가자에서 빠지고 그날(참여한 KST 날짜) 레이드 횟수 1회를 돌려받는다. 시간 제한은 빈자리를 붙잡아 두는 악용 방지.
 * - 소환 취소: 내가 소환한 레이드에 다른 참가자 0명·내 공격 0회·진행 중일 때(시간 제한 없음).
 *   레이드를 지우고(참가자·참가 요청·초대는 CASCADE) 낸 소환비를 돌려주고 그날 횟수 1회를 돌려준다.
 *   하루 첫 무료 소환은 raids 행으로 세므로 행이 지워지면 무료 기회도 다시 생긴다.
 *
 * 잠금 순서는 참여·공격과 같다: 레이드 행 → 참가자 행 → 그날 횟수 행(교착 없음).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 그날(KST) 레이드 횟수 1회 돌려주기 — 0 아래로는 내리지 않는다. */
async function giveBackDaily(tx: Tx, userId: string, serverId: number, kstDate: string) {
  await tx
    .update(raidDailyCounts)
    .set({ startedCount: sql`greatest(${raidDailyCounts.startedCount} - 1, 0)` })
    .where(and(eq(raidDailyCounts.userId, userId), eq(raidDailyCounts.serverId, serverId), eq(raidDailyCounts.kstDate, kstDate)));
}

async function lockActiveRaid(tx: Tx, raidId: bigint, serverId: number) {
  const [raid] = await tx
    .select({ id: raids.id, serverId: raids.serverId, hostUserId: raids.hostUserId, status: raids.status, expireAt: raids.expireAt, openedAt: raids.openedAt })
    .from(raids)
    .where(eq(raids.id, raidId))
    .for('update');
  if (!raid || raid.serverId !== serverId) throw new RaidError('RAID_NOT_FOUND');
  if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) throw new RaidError('RAID_CLOSED');
  return raid;
}

/** 참여 취소 — 반환: 그날 횟수를 돌려받은 KST 날짜. */
export function leaveRaid(input: { userId: string; serverId: number; raidId: bigint }): Promise<{ kstDate: string }> {
  const { userId, serverId, raidId } = input;
  return db.transaction(async (tx) => {
    const raid = await lockActiveRaid(tx, raidId, serverId);
    if (raid.hostUserId === userId) throw new RaidError('CANCEL_NOT_ALLOWED'); // 소환자는 소환 취소로
    const [part] = await tx
      .select({ id: raidParticipants.id, attacksUsed: raidParticipants.attacksUsed, extraAttacks: raidParticipants.extraAttacks, totalDamage: raidParticipants.totalDamage, joinedAt: raidParticipants.joinedAt })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, userId)))
      .for('update');
    if (!part) throw new RaidError('NOT_PARTICIPANT');
    if (part.attacksUsed > 0 || part.extraAttacks > 0 || part.totalDamage > 0n) throw new RaidError('CANCEL_NOT_ALLOWED');
    if (Date.now() - part.joinedAt.getTime() > RAID_LEAVE_WINDOW_MS) throw new RaidError('CANCEL_EXPIRED');

    await tx.delete(raidParticipants).where(eq(raidParticipants.id, part.id));
    // 승인으로 들어왔다면 그 요청 행·받은 초대도 지운다 — 남아 있으면 다시 들어올 때 '이미 요청함'으로 막힌다.
    await tx.delete(raidJoinRequests).where(and(eq(raidJoinRequests.raidId, raidId), eq(raidJoinRequests.userId, userId)));
    await tx.delete(raidInvites).where(and(eq(raidInvites.raidId, raidId), eq(raidInvites.inviteeUserId, userId)));
    const kstDate = kstDateString(part.joinedAt);
    await giveBackDaily(tx, userId, serverId, kstDate);
    return { kstDate };
  });
}

/** 소환 취소 — 반환: 돌려준 다이아(무료 소환이면 0). */
export function cancelHostedRaid(input: { userId: string; serverId: number; raidId: bigint }): Promise<{ refund: number }> {
  const { userId, serverId, raidId } = input;
  return db.transaction(async (tx) => {
    const raid = await lockActiveRaid(tx, raidId, serverId);
    if (raid.hostUserId !== userId) throw new RaidError('NOT_HOST');
    const parts = await tx
      .select({ userId: raidParticipants.userId, attacksUsed: raidParticipants.attacksUsed, extraAttacks: raidParticipants.extraAttacks, totalDamage: raidParticipants.totalDamage })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raidId))
      .for('update');
    if (parts.some((p) => p.userId !== userId)) throw new RaidError('CANCEL_NOT_ALLOWED');
    const me = parts.find((p) => p.userId === userId);
    if (me && (me.attacksUsed > 0 || me.extraAttacks > 0 || me.totalDamage > 0n)) throw new RaidError('CANCEL_NOT_ALLOWED');

    // 낸 소환비 — 원장에서 이 레이드의 소환 지출을 찾는다(11-16부터 ref = raid_open:<id>).
    // 그 전에 연 레이드는 ref가 없어, 같은 트랜잭션 시각(now())에 남은 소환 지출로 찾는다(raids.opened_at = 원장 created_at).
    const [spent] = (await tx.execute(sql`
      select coalesce(-sum(delta), 0)::bigint::text as paid from diamond_ledger
       where user_id = ${userId}::uuid and server_id = ${serverId} and reason = 'raid_open'
         and (ref = ${`raid_open:${raidId}`} or (ref is null and created_at = ${raid.openedAt.toISOString()}::timestamptz))`)) as unknown as { paid: string }[];
    const refund = Math.max(0, Number(spent?.paid ?? 0));

    // 공격 0회라 raid_attacks는 없지만, 혹시 남은 행이 있으면 함께 지운다(FK 없음).
    await tx.execute(sql`delete from raid_attacks where raid_id = ${raidId}::bigint`);
    await tx.delete(raids).where(eq(raids.id, raidId)); // 참가자·참가 요청·초대·보상은 CASCADE
    await giveBackDaily(tx, userId, serverId, kstDateString(raid.openedAt));
    if (refund > 0) await walletAdd(tx, userId, serverId, refund, 'raid_open_refund', `raid_open_refund:${raidId}`);
    return { refund };
  });
}
