import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';
import { containsProfanity } from '@/lib/game/moderation/profanity';
import { logWorldEvent } from '@/lib/game/world/event';

import { logGuildAudit } from './audit';
import { GUILD_NAME_MAX_LEN, GUILD_NAME_MIN_LEN, GUILD_RENAME_AFTER_DAYS, GUILD_RENAME_COOLDOWN_DAYS } from './balance';
import { GUILD_NAME_CHAR_REGEX, normalizeGuildName } from './create';
import { GuildError } from './errors';

const DAY = 86_400_000;

/** 다음 변경 가능 시각 — 결성 7일 뒤(첫 변경) 또는 마지막 변경 30일 뒤. */
export function guildRenameReadyAt(createdAt: Date, renamedAt: Date | null): Date {
  const first = new Date(createdAt.getTime() + GUILD_RENAME_AFTER_DAYS * DAY);
  if (!renamedAt) return first;
  const next = new Date(renamedAt.getTime() + GUILD_RENAME_COOLDOWN_DAYS * DAY);
  return next > first ? next : first;
}

/**
 * 길드명 변경(2026-08-31) — 길드장 전용. 이름 규칙·중복·비속어는 결성과 동일.
 * 역사 정책: 이미 발행된 연대기 본문은 그대로(옛 이름), 변경 이후 사건부터 새 이름.
 * 변경 사실 자체는 world_events.guild_rename으로 남겨 그날 연대기·월드 피드·길드 로그에 기록된다.
 */
export function renameGuild(input: { userId: string; serverId: number; name: string }): Promise<{ before: string; after: string }> {
  const name = normalizeGuildName(input.name);
  if (name.length < GUILD_NAME_MIN_LEN || name.length > GUILD_NAME_MAX_LEN) return Promise.reject(new GuildError('NAME_INVALID'));
  if (!GUILD_NAME_CHAR_REGEX.test(name)) return Promise.reject(new GuildError('NAME_CHARSET'));
  if (containsProfanity(name)) return Promise.reject(new GuildError('PROFANITY'));

  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader') throw new GuildError('NOT_LEADER');

    const [g] = await tx
      .select({ name: guilds.name, createdAt: guilds.createdAt, renamedAt: guilds.renamedAt })
      .from(guilds)
      .where(eq(guilds.id, m.guildId))
      .for('update');
    if (!g) throw new GuildError('GUILD_NOT_FOUND');
    if (g.name === name) throw new GuildError('NAME_INVALID');
    if (Date.now() < guildRenameReadyAt(g.createdAt, g.renamedAt).getTime()) {
      throw new GuildError(g.renamedAt ? 'RENAME_COOLDOWN' : 'RENAME_TOO_EARLY');
    }
    // 전역 유일(결성과 동일) — unique 제약이 최종 방어.
    const [dup] = await tx.select({ id: guilds.id }).from(guilds).where(eq(guilds.name, name)).limit(1);
    if (dup) throw new GuildError('NAME_TAKEN');

    await tx.update(guilds).set({ name, renamedAt: new Date() }).where(eq(guilds.id, m.guildId));
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: m.guildId,
      actorUserId: input.userId,
      action: 'rename',
      detail: { before: g.name, after: name },
    });
    return { before: g.name, after: name };
  }).then(async (r) => {
    // 월드 피드·연대기 재료 — 트랜잭션 밖(best-effort, 피드 실패가 변경을 막지 않게).
    const [m] = await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .limit(1);
    await logWorldEvent(input.serverId, 'guild_rename', { guildName: r.after, before: r.before }, { actorUserId: input.userId, guildId: m?.guildId }).catch(() => undefined);
    return r;
  });
}
