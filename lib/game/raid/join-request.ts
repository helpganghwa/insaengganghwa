import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { raids, raidParticipants, raidJoinRequests } from '@/lib/db/schema/raid';
import { profiles } from '@/lib/db/schema/profiles';
import { RAID_MAX_PARTICIPANTS, RAID_MAX_CONCURRENT_PER_USER } from '@/lib/game/balance';
import { RaidError, activeRaidCount, bumpDailyOrThrow } from './open';
import { joinRaid } from './join';

export type JoinRequestState = 'joined' | 'requested';
export type JoinScope = 'friend' | 'guild' | 'link';

/**
 * 목록/링크 참가 통합 — 경로(scope)와 라이드의 공개 모드에 따라 즉시 참가 or 요청.
 *  - link: 항상 요청(수락 필요). 친구/길드: 해당 scope의 share 모드가 'free'면 즉시, 'approval'이면 요청.
 */
export async function joinOrRequestRaid(input: {
  userId: string;
  shareCode: string;
  scope: JoinScope;
}): Promise<{ raidId: bigint; state: JoinRequestState }> {
  const { userId, shareCode, scope } = input;
  if (scope === 'link') return requestJoinRaid({ userId, shareCode });

  const [raid] = await db
    .select({ friendShare: raids.friendShare, guildShare: raids.guildShare })
    .from(raids)
    .where(eq(raids.shareCode, shareCode))
    .limit(1);
  if (!raid) throw new RaidError('RAID_NOT_FOUND');
  const mode = scope === 'friend' ? raid.friendShare : raid.guildShare;
  if (mode === 'free') {
    const r = await joinRaid({ userId, shareCode });
    return { raidId: r.raidId, state: 'joined' };
  }
  if (mode === 'approval') return requestJoinRaid({ userId, shareCode });
  throw new RaidError('NOT_SHARED'); // 'off' — 비공개(목록에 없어야 함, 유출 링크/레이스 대비 명시)
}

/**
 * 공유링크(/raid-invite) 참가 — 즉시 참여가 아니라 pending 요청 생성(개설자 수락 대기).
 * 링크 유출 대비. 호스트 본인/이미 참가자면 요청 없이 'joined'(바로 진입).
 * 친구/길드 목록 참가는 신뢰 경로라 joinRaid(즉시) 사용 — 이 경로 미사용.
 */
export function requestJoinRaid(input: {
  userId: string;
  shareCode: string;
}): Promise<{ raidId: bigint; state: JoinRequestState }> {
  const { userId, shareCode } = input;
  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
        status: raids.status,
        expireAt: raids.expireAt,
        hostUserId: raids.hostUserId,
        serverId: raids.serverId,
      })
      .from(raids)
      .where(eq(raids.shareCode, shareCode))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED');
    }
    // 호스트 or 이미 참가자 → 요청 없이 바로 진입.
    if (raid.hostUserId === userId) return { raidId: raid.id, state: 'joined' as const };
    const [existing] = await tx
      .select({ id: raidParticipants.id })
      .from(raidParticipants)
      .where(and(eq(raidParticipants.raidId, raid.id), eq(raidParticipants.userId, userId)))
      .limit(1);
    if (existing) return { raidId: raid.id, state: 'joined' as const };

    // 정원 초과면 요청 자체 차단(헛된 요청 방지).
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(raidParticipants)
      .where(eq(raidParticipants.raidId, raid.id));
    if (n >= RAID_MAX_PARTICIPANTS) throw new RaidError('RAID_FULL');

    // pending 요청 upsert(재요청·거절 후 재요청 → pending 갱신).
    await tx
      .insert(raidJoinRequests)
      .values({ raidId: raid.id, userId, status: 'pending' })
      .onConflictDoUpdate({
        target: [raidJoinRequests.raidId, raidJoinRequests.userId],
        set: { status: 'pending', decidedAt: null, createdAt: new Date() },
      });
    return { raidId: raid.id, state: 'requested' as const };
  });
}

/** 개설자의 참가요청 수락/거절. 수락 시 참가자 추가(요청자 정원·동시·일일 한도 검증). 멱등. */
export function decideJoinRequest(input: {
  hostUserId: string;
  raidId: bigint;
  requesterUserId: string;
  approve: boolean;
}): Promise<{ approved: boolean }> {
  const { hostUserId, raidId, requesterUserId, approve } = input;
  return db.transaction(async (tx) => {
    const [raid] = await tx
      .select({
        id: raids.id,
        serverId: raids.serverId,
        status: raids.status,
        expireAt: raids.expireAt,
        hostUserId: raids.hostUserId,
      })
      .from(raids)
      .where(eq(raids.id, raidId))
      .for('update');
    if (!raid) throw new RaidError('RAID_NOT_FOUND');
    if (raid.hostUserId !== hostUserId) throw new RaidError('NOT_HOST');

    const [req] = await tx
      .select({ id: raidJoinRequests.id, status: raidJoinRequests.status })
      .from(raidJoinRequests)
      .where(
        and(
          eq(raidJoinRequests.raidId, raidId),
          eq(raidJoinRequests.userId, requesterUserId),
        ),
      )
      .for('update');
    if (!req) throw new RaidError('REQUEST_NOT_FOUND');
    if (req.status !== 'pending') return { approved: req.status === 'approved' }; // 멱등

    if (!approve) {
      await tx
        .update(raidJoinRequests)
        .set({ status: 'rejected', decidedAt: new Date() })
        .where(eq(raidJoinRequests.id, req.id));
      return { approved: false };
    }

    // 수락 — 참가자 추가(요청자 기준). 실패 시 트랜잭션 롤백 → 요청 pending 유지.
    if (raid.status !== 'active' || raid.expireAt.getTime() <= Date.now()) {
      throw new RaidError('RAID_CLOSED');
    }
    const [already] = await tx
      .select({ id: raidParticipants.id })
      .from(raidParticipants)
      .where(
        and(eq(raidParticipants.raidId, raidId), eq(raidParticipants.userId, requesterUserId)),
      )
      .limit(1);
    if (!already) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(raidParticipants)
        .where(eq(raidParticipants.raidId, raidId));
      if (n >= RAID_MAX_PARTICIPANTS) throw new RaidError('RAID_FULL');
      if ((await activeRaidCount(tx, requesterUserId)) >= RAID_MAX_CONCURRENT_PER_USER) {
        throw new RaidError('CONCURRENT_LIMIT');
      }
      // 일일 한도는 '요청 시점'이 아니라 '승인 시점'에 요청자 기준으로 차감(승인일 KST 윈도).
      // 의도적: 실제 참가가 확정될 때만 1회 소모. 요청만 하고 거절/방치되면 한도 미차감.
      await bumpDailyOrThrow(tx, requesterUserId, raid.serverId);
      await tx.insert(raidParticipants).values({ raidId, userId: requesterUserId });
    }
    await tx
      .update(raidJoinRequests)
      .set({ status: 'approved', decidedAt: new Date() })
      .where(eq(raidJoinRequests.id, req.id));
    return { approved: true };
  });
}

/** 호스트 UI — pending 참가요청(요청자 닉/공개코드). */
export async function getPendingJoinRequests(
  raidId: bigint,
): Promise<{ userId: string; nickname: string; publicCode: string }[]> {
  return db
    .select({
      userId: raidJoinRequests.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
    })
    .from(raidJoinRequests)
    .innerJoin(profiles, eq(profiles.id, raidJoinRequests.userId))
    .innerJoin(raids, eq(raids.id, raidJoinRequests.raidId))
    .innerJoin(
      characters,
      and(eq(characters.userId, raidJoinRequests.userId), eq(characters.serverId, raids.serverId)),
    )
    .where(and(eq(raidJoinRequests.raidId, raidId), eq(raidJoinRequests.status, 'pending')))
    .orderBy(raidJoinRequests.createdAt);
}
