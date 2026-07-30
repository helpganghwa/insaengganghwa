import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  guilds,
  guildMembers,
  guildLeaveLog,
  guildJoinRequests,
} from '@/lib/db/schema/guild';

import { logGuildAudit } from './audit';
import {
  GUILD_JOIN_REQUEST_TTL_DAYS,
  GUILD_REJOIN_LOCK_HOURS,
  guildCapacity,
  type GuildJoinPolicy,
} from './balance';
import { GuildError } from './errors';
import { assertGuildPerm } from './perm-guard';
import { joinGuild } from './join';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 가입 관리 권한 검증 후 길드 id 반환 — joinReview 권한(길드장 · 허용된 부길드장, 0142).
 * 2026-07-10에 길드장 전속으로 올렸던 것을 개인별 권한으로 되돌린다(문의 #106·#107 —
 * 길드장 부재 시 신청이 쌓이는 문제). 가입 방식 변경도 같은 권한으로 묶는다(같은 영역이고,
 * 거의 바뀌지 않는 설정에 토글을 하나 더 두는 건 과하다).
 */
async function assertJoinManage(tx: Tx, userId: string, serverId: number): Promise<bigint> {
  const { guildId } = await assertGuildPerm(tx, userId, serverId, 'joinReview');
  return guildId;
}

/** 비소속 + 24h 재가입 잠금 검사(요청/즉시가입 공통). */
async function assertJoinable(tx: Tx, userId: string, serverId: number): Promise<void> {
  const [m] = await tx
    .select({ g: guildMembers.guildId })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  if (m) throw new GuildError('ALREADY_IN_GUILD');

  const [lastLeave] = await tx
    .select({ leftAt: guildLeaveLog.leftAt })
    .from(guildLeaveLog)
    .where(and(eq(guildLeaveLog.userId, userId), eq(guildLeaveLog.serverId, serverId)))
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
}): Promise<{ joined: boolean; guildId: bigint; serverId: number }> {
  const [g] = await db
    .select({ joinPolicy: guilds.joinPolicy, serverId: guilds.serverId })
    .from(guilds)
    .where(eq(guilds.id, input.guildId))
    .limit(1);
  if (!g) throw new GuildError('GUILD_NOT_FOUND');

  if (g.joinPolicy !== 'approval') {
    await joinGuild(input);
    return { joined: true, guildId: input.guildId, serverId: g.serverId };
  }

  // 승인제 — 신청만 등록.
  await db.transaction(async (tx) => {
    await assertJoinable(tx, input.userId, g.serverId);
    await tx
      .insert(guildJoinRequests)
      .values({ userId: input.userId, serverId: g.serverId, guildId: input.guildId })
      .onConflictDoUpdate({
        target: [guildJoinRequests.userId, guildJoinRequests.serverId],
        set: { guildId: input.guildId, createdAt: sql`now()` },
      });
  });
  return { joined: false, guildId: input.guildId, serverId: g.serverId };
}

/** 가입 신청 승인 — joinReview 권한. 정원·재가입 잠금 재검사 후 멤버 등록 + 신청 삭제. */
export async function approveJoinRequest(input: {
  actorUserId: string;
  serverId: number;
  requestUserId: string;
}): Promise<{ guildId: bigint }> {
  return db.transaction(async (tx) => {
    const guildId = await assertJoinManage(tx, input.actorUserId, input.serverId);

    const [req] = await tx
      .select({ guildId: guildJoinRequests.guildId, createdAt: guildJoinRequests.createdAt })
      .from(guildJoinRequests)
      .where(
        and(
          eq(guildJoinRequests.userId, input.requestUserId),
          eq(guildJoinRequests.serverId, input.serverId),
        ),
      )
      .for('update');
    if (!req || req.guildId !== guildId) throw new GuildError('NO_JOIN_REQUEST');
    // 만료 신청은 승인 불가 — 목록은 이미 걸러 보여주지만, 화면을 오래 열어둔 사이 만료된
    // 신청이 승인되는 경로를 서버에서도 막는다(정리 크론이 아직 안 돌았어도 동일 판정).
    if (Date.now() - req.createdAt.getTime() > GUILD_JOIN_REQUEST_TTL_DAYS * 86_400_000) {
      throw new GuildError('NO_JOIN_REQUEST');
    }

    await assertJoinable(tx, input.requestUserId, input.serverId); // 그 사이 타 길드 가입/탈퇴 잠금 재검사

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

    await tx
      .insert(guildMembers)
      .values({ userId: input.requestUserId, serverId: input.serverId, guildId, role: 'member' });
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId,
      actorUserId: input.requestUserId,
      action: 'join',
    });
    await tx
      .delete(guildJoinRequests)
      .where(
        and(
          eq(guildJoinRequests.userId, input.requestUserId),
          eq(guildJoinRequests.serverId, input.serverId),
        ),
      );
    return { guildId };
  });
}

/** 가입 신청 거절 — joinReview 권한. 자기 길드 신청만 삭제. */
export async function rejectJoinRequest(input: {
  actorUserId: string;
  serverId: number;
  requestUserId: string;
}): Promise<{ guildId: bigint }> {
  return db.transaction(async (tx) => {
    const guildId = await assertJoinManage(tx, input.actorUserId, input.serverId);
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
    return { guildId };
  });
}

/** 가입 방식 변경 — joinReview 권한(가입 관리와 같은 영역). */
export async function setJoinPolicy(input: {
  userId: string;
  serverId: number;
  policy: GuildJoinPolicy;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const guildId = await assertJoinManage(tx, input.userId, input.serverId);
    await tx.update(guilds).set({ joinPolicy: input.policy }).where(eq(guilds.id, guildId));
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId,
      actorUserId: input.userId,
      action: 'set_join_policy',
      detail: { policy: input.policy },
    });
  });
}
