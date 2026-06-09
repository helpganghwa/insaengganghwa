import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildLeaveLog } from '@/lib/db/schema/guild';

import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMember(tx: Tx, userId: string) {
  const [m] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .for('update');
  return m ?? null;
}

/** 길드장 위임 — GUILD §4. 길드장만, 같은 길드원 대상. 길드장↔멤버 교체 + guilds.leader 갱신. */
export function transferLeadership(input: {
  leaderUserId: string;
  targetUserId: string;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.leaderUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const leader = await lockMember(tx, input.leaderUserId);
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const target = await lockMember(tx, input.targetUserId);
    if (!target || target.guildId !== leader.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');

    await tx.update(guildMembers).set({ role: 'member' }).where(eq(guildMembers.userId, input.leaderUserId));
    await tx.update(guildMembers).set({ role: 'leader' }).where(eq(guildMembers.userId, input.targetUserId));
    await tx.update(guilds).set({ leaderUserId: input.targetUserId }).where(eq(guilds.id, leader.guildId));
  });
}

/** 부길드장 임명/해제 — GUILD §4. 길드장만. 대상은 길드장 불가. */
export function setViceRole(input: {
  leaderUserId: string;
  targetUserId: string;
  makeVice: boolean;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.leaderUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const leader = await lockMember(tx, input.leaderUserId);
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const target = await lockMember(tx, input.targetUserId);
    if (!target || target.guildId !== leader.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role === 'leader') throw new GuildError('INVALID_TARGET');

    await tx
      .update(guildMembers)
      .set({ role: input.makeVice ? 'vice' : 'member' })
      .where(eq(guildMembers.userId, input.targetUserId));
  });
}

/** 멤버 추방 — GUILD §4. 길드장/부길드장만. 길드장 추방 불가, 부길드장은 멤버만 추방. 24h 재가입 잠금 적용. */
export function kickMember(input: {
  actorUserId: string;
  targetUserId: string;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.actorUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const actor = await lockMember(tx, input.actorUserId);
    if (!actor) throw new GuildError('NOT_IN_GUILD');
    if (actor.role === 'member') throw new GuildError('FORBIDDEN');
    const target = await lockMember(tx, input.targetUserId);
    if (!target || target.guildId !== actor.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role === 'leader') throw new GuildError('INVALID_TARGET');
    if (target.role === 'vice' && actor.role !== 'leader') throw new GuildError('FORBIDDEN');

    await tx.delete(guildMembers).where(eq(guildMembers.userId, input.targetUserId));
    await tx.insert(guildLeaveLog).values({ userId: input.targetUserId });
  });
}
