import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers } from '@/lib/db/schema/guild';

import { logGuildAudit } from './audit';
import { GuildError } from './errors';
import { hasGuildPerm } from './permissions';
import { isMemberRank, type MemberRank } from './rank';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드원 등급 변경(0244) — 길드장, 그리고 '등급 관리' 권한을 받은 부길드장.
 * 대상은 길드원(role='member')만 — 부길드장·길드장은 역할이 곧 등급이라 여기서 다루지 않는다.
 * 값이 그대로면 기록도 남기지 않는다. 길드 기록(set_rank)에 남고 푸시는 보내지 않는다(사용자 결정).
 */
export async function setMemberRank(input: {
  actorUserId: string;
  serverId: number;
  targetUserId: string;
  rank: MemberRank;
}): Promise<void> {
  await db.transaction((tx) => setMemberRankTx(tx, input));
}

/** 트랜잭션 본체 — 테스트가 바깥 트랜잭션을 넘겨 롤백한다. */
export async function setMemberRankTx(
  tx: Tx,
  input: { actorUserId: string; serverId: number; targetUserId: string; rank: MemberRank },
): Promise<void> {
  if (!isMemberRank(input.rank)) throw new GuildError('INVALID_RANK');
  if (input.actorUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
  const [actor] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role, permissions: guildMembers.permissions })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, input.actorUserId), eq(guildMembers.serverId, input.serverId)))
    .for('update');
  if (!actor) throw new GuildError('NOT_IN_GUILD');
  if (!hasGuildPerm(actor.role, actor.permissions, 'rank')) throw new GuildError('NO_PERMISSION');
  const [target] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role, rank: guildMembers.rank })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)))
    .for('update');
  if (!target || target.guildId !== actor.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
  if (target.role !== 'member') throw new GuildError('INVALID_TARGET');
  if (target.rank === input.rank) return;
  await tx
    .update(guildMembers)
    .set({ rank: input.rank })
    .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
  await logGuildAudit(tx, {
    serverId: input.serverId,
    guildId: actor.guildId,
    actorUserId: input.actorUserId,
    action: 'set_rank',
    targetUserId: input.targetUserId,
    detail: { from: target.rank, to: input.rank },
  });
}
