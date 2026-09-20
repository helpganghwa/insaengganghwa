import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, guilds } from '@/lib/db/schema/guild';
import { logGuildAudit } from '@/lib/game/guild/audit';
import { GuildError } from '@/lib/game/guild/errors';

import type { DeployVisibility } from './deploy-visibility';

/**
 * 점령전 배치 정보 공개 범위 변경(0204) — **길드장만**. 누가 길드의 전력 배치를 볼 수 있는지 정하는 일이라
 * 부길드장에게 위임하지 않는다(권한 설정 자체가 길드장 전속인 것과 같은 이유). 값이 그대로면 기록도 남기지 않는다.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function setDeployVisibility(input: { userId: string; serverId: number; visibility: DeployVisibility }): Promise<void> {
  await db.transaction((tx) => setDeployVisibilityTx(tx, input));
}

/** 트랜잭션 본체 — 테스트가 바깥 트랜잭션을 넘겨 롤백한다. */
export async function setDeployVisibilityTx(
  tx: Tx,
  input: { userId: string; serverId: number; visibility: DeployVisibility },
): Promise<void> {
  const [me] = await tx
    .select({ guildId: guildMembers.guildId, role: guildMembers.role })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)));
  if (!me) throw new GuildError('NOT_IN_GUILD');
  if (me.role !== 'leader') throw new GuildError('NOT_LEADER');
  const [g] = await tx.select({ cur: guilds.deployVisibility }).from(guilds).where(eq(guilds.id, me.guildId)).for('update');
  if (!g || g.cur === input.visibility) return;
  await tx.update(guilds).set({ deployVisibility: input.visibility }).where(eq(guilds.id, me.guildId));
  await logGuildAudit(tx, {
    serverId: input.serverId,
    guildId: me.guildId,
    actorUserId: input.userId,
    action: 'set_deploy_visibility',
    detail: { visibility: input.visibility },
  });
}
