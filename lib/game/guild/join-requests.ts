import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  guilds,
  guildMembers,
  guildLeaveLog,
  guildJoinRequests,
} from '@/lib/db/schema/guild';

import { GUILD_REJOIN_LOCK_HOURS, guildCapacity, type GuildJoinPolicy } from './balance';
import { GuildError } from './errors';
import { joinGuild } from './join';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** actor가 길드 임원(길드장/부길드장)인지 검증하고 길드 id 반환. */
async function assertOfficer(tx: Tx, userId: string): Promise<bigint> {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (m.role !== 'leader' && m.role !== 'vice') throw new GuildError('NOT_OFFICER');
  return m.guildId;
}

/** 비소속 + 24h 재가입 잠금 검사(요청/즉시가입 공통). */
async function assertJoinable(tx: Tx, userId: string): Promise<void> {
  const [m] = await tx
    .select({ g: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (m) throw new GuildError('ALREADY_IN_GUILD');

  const [lastLeave] = await tx
    .select({ leftAt: guildLeaveLog.leftAt })
    .from(guildLeaveLog)
    .where(eq(guildLeaveLog.userId, userId))
    .orderBy(desc(guildLeaveLog.leftAt))
    .limit(1);
  if (lastLeave && Date.now() - lastLeave.leftAt.getTime() < GUILD_REJOIN_LOCK_HOURS * 3_600_000) {
    throw new GuildError('REJOIN_LOCKED');
  }
}

/**
 * 가입 — GUILD §1. 길드 가입 방식에 따라 분기:
 *  - open(자유): 즉시 가입(joinGuild). { joined: true }
 *  - approval(승인): 가입 신청 등록(1유저 1신청, 길드 전환 시 덮어씀). { joined: false }
 */
export async function requestOrJoinGuild(input: {
  userId: string;
  guildId: bigint;
}): Promise<{ joined: boolean }> {
  const [g] = await db
    .select({ joinPolicy: guilds.joinPolicy })
    .from(guilds)
    .where(eq(guilds.id, input.guildId))
    .limit(1);
  if (!g) throw new GuildError('GUILD_NOT_FOUND');

  if (g.joinPolicy !== 'approval') {
    await joinGuild(input);
    return { joined: true };
  }

  // 승인제 — 신청만 등록.
  await db.transaction(async (tx) => {
    await assertJoinable(tx, input.userId);
    await tx
      .insert(guildJoinRequests)
      .values({ userId: input.userId, guildId: input.guildId })
      .onConflictDoUpdate({
        target: guildJoinRequests.userId,
        set: { guildId: input.guildId, createdAt: sql`now()` },
      });
  });
  return { joined: false };
}

/** 가입 신청 승인 — 길드장/부길드장. 정원·재가입 잠금 재검사 후 멤버 등록 + 신청 삭제. */
export async function approveJoinRequest(input: {
  actorUserId: string;
  requestUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const guildId = await assertOfficer(tx, input.actorUserId);

    const [req] = await tx
      .select({ guildId: guildJoinRequests.guildId })
      .from(guildJoinRequests)
      .where(eq(guildJoinRequests.userId, input.requestUserId))
      .for('update');
    if (!req || req.guildId !== guildId) throw new GuildError('NO_JOIN_REQUEST');

    await assertJoinable(tx, input.requestUserId); // 그 사이 타 길드 가입/탈퇴 잠금 재검사

    const [g] = await tx
      .select({ level: guilds.level })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .for('update');
    if (!g) throw new GuildError('GUILD_NOT_FOUND');
    const [cnt] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    if ((cnt?.n ?? 0) >= guildCapacity(g.level)) throw new GuildError('GUILD_FULL');

    await tx.insert(guildMembers).values({ userId: input.requestUserId, guildId, role: 'member' });
    await tx.delete(guildJoinRequests).where(eq(guildJoinRequests.userId, input.requestUserId));
  });
}

/** 가입 신청 거절 — 길드장/부길드장. 자기 길드 신청만 삭제. */
export async function rejectJoinRequest(input: {
  actorUserId: string;
  requestUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const guildId = await assertOfficer(tx, input.actorUserId);
    const rows = await tx
      .delete(guildJoinRequests)
      .where(
        and(
          eq(guildJoinRequests.userId, input.requestUserId),
          eq(guildJoinRequests.guildId, guildId),
        ),
      )
      .returning({ userId: guildJoinRequests.userId });
    if (rows.length === 0) throw new GuildError('NO_JOIN_REQUEST');
  });
}

/** 가입 방식 변경 — 길드장/부길드장. */
export async function setJoinPolicy(input: {
  userId: string;
  policy: GuildJoinPolicy;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const guildId = await assertOfficer(tx, input.userId);
    await tx.update(guilds).set({ joinPolicy: input.policy }).where(eq(guilds.id, guildId));
  });
}
