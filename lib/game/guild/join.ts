import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildLeaveLog, guildJoinRequests } from '@/lib/db/schema/guild';

import { GUILD_REJOIN_LOCK_HOURS, guildCapacity } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

/**
 * 길드 가입 — GUILD §1. 단일 트랜잭션: 1유저1길드 + 24h 재가입 잠금 + 수용 인원 검사 + 멤버 insert.
 * 길드 행을 for update로 잠가 동시 가입의 정원 초과(over-fill) 레이스 차단.
 */
export function joinGuild(input: { userId: string; guildId: bigint }): Promise<void> {
  return db.transaction(async (tx) => {
    // 길드의 서버가 스코프 기준(SERVER.md P5) — 멤버십·재가입 잠금·insert 전부 이 서버 내.
    const [g] = await tx
      .select({ id: guilds.id, serverId: guilds.serverId, level: guilds.level })
      .from(guilds)
      .where(eq(guilds.id, input.guildId))
      .for('update');
    if (!g) throw new GuildError('GUILD_NOT_FOUND');

    const [m] = await tx
      .select({ g: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, g.serverId)))
      .for('update');
    if (m) throw new GuildError('ALREADY_IN_GUILD');

    // 탈퇴 후 24h 재가입 잠금(가장 최근 탈퇴 기준, 서버별).
    const [lastLeave] = await tx
      .select({ leftAt: guildLeaveLog.leftAt })
      .from(guildLeaveLog)
      .where(and(eq(guildLeaveLog.userId, input.userId), eq(guildLeaveLog.serverId, g.serverId)))
      .orderBy(desc(guildLeaveLog.leftAt))
      .limit(1);
    if (
      lastLeave &&
      Date.now() - lastLeave.leftAt.getTime() < GUILD_REJOIN_LOCK_HOURS * 3_600_000
    ) {
      throw new GuildError('REJOIN_LOCKED');
    }

    const [cnt] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, input.guildId));
    if ((cnt?.n ?? 0) >= guildCapacity(g.level)) throw new GuildError('GUILD_FULL');

    await tx
      .insert(guildMembers)
      .values({ userId: input.userId, serverId: g.serverId, guildId: input.guildId, role: 'member' });
    await logGuildAudit(tx, {
      serverId: g.serverId,
      guildId: input.guildId,
      actorUserId: input.userId,
      action: 'join',
    });

    // 가입 시 본인 대기 가입신청 정리 — 타 길드 신청 잔존(임원 목록 클러터) 방지. 만료 대신 청소.
    await tx
      .delete(guildJoinRequests)
      .where(and(eq(guildJoinRequests.userId, input.userId), eq(guildJoinRequests.serverId, g.serverId)));
  });
}
