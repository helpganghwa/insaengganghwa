import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildLeaveLog } from '@/lib/db/schema/guild';

import { GUILD_MAX_VICE } from './balance';
import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMember(tx: Tx, userId: string, serverId: number) {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .for('update');
  return m ?? null;
}

/** 길드장 위임 — GUILD §4. 길드장만, 같은 길드원 대상. 길드장↔멤버 교체 + guilds.leader 갱신. */
export function transferLeadership(input: {
  leaderUserId: string;
  serverId: number;
  targetUserId: string;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.leaderUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const leader = await lockMember(tx, input.leaderUserId, input.serverId);
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const target = await lockMember(tx, input.targetUserId, input.serverId);
    if (!target || target.guildId !== leader.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');

    await tx.update(guildMembers).set({ role: 'member' }).where(and(eq(guildMembers.userId, input.leaderUserId), eq(guildMembers.serverId, input.serverId)));
    await tx.update(guildMembers).set({ role: 'leader' }).where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
    await tx.update(guilds).set({ leaderUserId: input.targetUserId }).where(eq(guilds.id, leader.guildId));
  });
}

/** 부길드장 임명/해제 — GUILD §4. 길드장만. 대상은 길드장 불가. */
export function setViceRole(input: {
  leaderUserId: string;
  serverId: number;
  targetUserId: string;
  makeVice: boolean;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.leaderUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const leader = await lockMember(tx, input.leaderUserId, input.serverId);
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const target = await lockMember(tx, input.targetUserId, input.serverId);
    if (!target || target.guildId !== leader.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role === 'leader') throw new GuildError('INVALID_TARGET');

    // 부길드장 상한(5명) — 신규 임명(현재 vice 아님) 시에만 검사.
    if (input.makeVice && target.role !== 'vice') {
      const [cnt] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, leader.guildId), eq(guildMembers.role, 'vice')));
      if ((cnt?.n ?? 0) >= GUILD_MAX_VICE) throw new GuildError('VICE_LIMIT');
    }

    await tx
      .update(guildMembers)
      .set({ role: input.makeVice ? 'vice' : 'member' })
      .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
  });
}

/** 멤버 추방 — GUILD §4. 길드장/부길드장만. 길드장 추방 불가, 부길드장은 멤버만 추방. 24h 재가입 잠금 적용. */
export function kickMember(input: {
  actorUserId: string;
  serverId: number;
  targetUserId: string;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.actorUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const actor = await lockMember(tx, input.actorUserId, input.serverId);
    if (!actor) throw new GuildError('NOT_IN_GUILD');
    if (actor.role === 'member') throw new GuildError('FORBIDDEN');
    const target = await lockMember(tx, input.targetUserId, input.serverId);
    if (!target || target.guildId !== actor.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role === 'leader') throw new GuildError('INVALID_TARGET');
    if (target.role === 'vice' && actor.role !== 'leader') throw new GuildError('FORBIDDEN');

    await tx.delete(guildMembers).where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
    await tx.insert(guildLeaveLog).values({ userId: input.targetUserId, serverId: input.serverId });
  });
}
