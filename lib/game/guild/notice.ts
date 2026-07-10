import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';

import { containsProfanity } from '@/lib/game/moderation/profanity';

import { GUILD_INTRO_MAX_LEN, GUILD_NOTICE_MAX_LEN } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

/**
 * 길드 공지 설정/해제 — 길드장·부길드장만. 빈 문자열이면 공지 제거(null).
 * 길이는 GUILD_NOTICE_MAX_LEN로 방어 절단(클라가 이미 제한하지만 서버 권위).
 */
export async function setGuildNotice(input: { userId: string; serverId: number; notice: string }): Promise<void> {
  const text = input.notice.trim().slice(0, GUILD_NOTICE_MAX_LEN);
  if (containsProfanity(text)) throw new GuildError('PROFANITY');
  await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader' && m.role !== 'vice') throw new GuildError('NOT_OFFICER');
    await tx
      .update(guilds)
      .set({ notice: text.length > 0 ? text : null })
      .where(eq(guilds.id, m.guildId));
    // 길드 로그 — 누가 공지를 수정/삭제했는지 피드에 남김(2026-07-10 권한 감사 요청).
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: m.guildId,
      actorUserId: input.userId,
      action: 'notice_edit',
      detail: { cleared: text.length === 0 },
    });
  });
}

/**
 * 길드 소개(공개) 설정/해제 — 길드장·부길드장만. 빈 문자열이면 제거(null). 목록 팝업 노출용.
 * 길이는 GUILD_INTRO_MAX_LEN로 방어 절단(서버 권위).
 */
export async function setGuildIntro(input: { userId: string; serverId: number; intro: string }): Promise<void> {
  const text = input.intro.trim().slice(0, GUILD_INTRO_MAX_LEN);
  if (containsProfanity(text)) throw new GuildError('PROFANITY');
  await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .limit(1);
    if (!m) throw new GuildError('NOT_IN_GUILD');
    if (m.role !== 'leader' && m.role !== 'vice') throw new GuildError('NOT_OFFICER');
    await tx
      .update(guilds)
      .set({ intro: text.length > 0 ? text : null })
      .where(eq(guilds.id, m.guildId));
  });
}
