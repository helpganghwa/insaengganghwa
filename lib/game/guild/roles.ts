import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildLeaveLog } from '@/lib/db/schema/guild';

import { logGuildAudit } from './audit';
import { GUILD_MAX_VICE } from './balance';
import { clearConquestRoleOnExit } from './conquest/on-member-exit';
import { GuildError } from './errors';
import { GUILD_PERM_DEFAULT, hasGuildPerm, sanitizePerms } from './permissions';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMember(tx: Tx, userId: string, serverId: number) {
  const [m] = await tx
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      permissions: guildMembers.permissions,
    })
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
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: leader.guildId,
      actorUserId: input.leaderUserId,
      action: 'transfer_leadership',
      targetUserId: input.targetUserId,
    });
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

    // 권한은 부길드장 자리에 붙는다(0142) — 임명 시 기본값(공지·소개·오픈채팅),
    // 해제 시 0으로 초기화. 재임명하면 이전 설정이 살아나지 않고 다시 기본값에서 시작한다.
    await tx
      .update(guildMembers)
      .set({
        role: input.makeVice ? 'vice' : 'member',
        permissions: input.makeVice ? GUILD_PERM_DEFAULT : 0,
      })
      .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: leader.guildId,
      actorUserId: input.leaderUserId,
      action: input.makeVice ? 'set_vice' : 'unset_vice',
      targetUserId: input.targetUserId,
    });
  });
}

/**
 * 멤버 추방 — GUILD §4. kick 권한(길드장 · 허용된 부길드장, 0142).
 * 길드장은 추방 대상이 될 수 없고, 부길드장을 추방하는 것은 길드장 전속이다.
 * 되돌릴 수 없는 동작이라 부길드장 기본값에서는 꺼져 있다. 재가입 잠금이 적용된다.
 */
export function kickMember(input: {
  actorUserId: string;
  serverId: number;
  targetUserId: string;
}): Promise<void> {
  return db.transaction(async (tx) => {
    if (input.actorUserId === input.targetUserId) throw new GuildError('INVALID_TARGET');
    const actor = await lockMember(tx, input.actorUserId, input.serverId);
    if (!actor) throw new GuildError('NOT_IN_GUILD');
    if (!hasGuildPerm(actor.role, actor.permissions, 'kick')) throw new GuildError('NO_PERMISSION');
    const target = await lockMember(tx, input.targetUserId, input.serverId);
    if (!target || target.guildId !== actor.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role === 'leader') throw new GuildError('INVALID_TARGET');
    if (target.role === 'vice' && actor.role !== 'leader') throw new GuildError('FORBIDDEN');

    await clearConquestRoleOnExit(tx, input.targetUserId, input.serverId); // 잔류 집행관·미정산 배치 정리
    await tx.delete(guildMembers).where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)));
    await tx.insert(guildLeaveLog).values({ userId: input.targetUserId, serverId: input.serverId });
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: actor.guildId,
      actorUserId: input.actorUserId,
      action: 'kick',
      targetUserId: input.targetUserId,
    });
  });
}

/**
 * 부길드장 권한 설정 — **길드장 전속**(0142). 부길드장이 자기 권한을 올릴 수 없어야 하므로
 * 이 동작 자체를 위임 대상에서 제외했다.
 * 대상은 같은 길드의 부길드장이어야 한다(일반 길드원·길드장은 권한 개념이 없다).
 * 변경 내역은 감사 로그에 남긴다 — 누가 누구에게 무엇을 열었는지가 분쟁의 근거가 된다.
 */
export function setVicePermissions(input: {
  leaderUserId: string;
  serverId: number;
  targetUserId: string;
  permissions: number;
}): Promise<void> {
  return db.transaction(async (tx) => {
    const leader = await lockMember(tx, input.leaderUserId, input.serverId);
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const target = await lockMember(tx, input.targetUserId, input.serverId);
    if (!target || target.guildId !== leader.guildId) throw new GuildError('TARGET_NOT_IN_GUILD');
    if (target.role !== 'vice') throw new GuildError('INVALID_TARGET');

    const next = sanitizePerms(input.permissions);
    if (next === target.permissions) return; // 변화 없음 — 로그도 남기지 않는다
    await tx
      .update(guildMembers)
      .set({ permissions: next })
      .where(
        and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.serverId, input.serverId)),
      );
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: leader.guildId,
      actorUserId: input.leaderUserId,
      action: 'set_perm',
      targetUserId: input.targetUserId,
      detail: { before: target.permissions, after: next },
    });
  });
}
