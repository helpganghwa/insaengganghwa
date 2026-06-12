import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers } from '@/lib/db/schema/guild';

import { GuildError } from './errors';

/**
 * 카카오 오픈채팅 URL만 허용 — 임의 외부 링크(피싱·광고)를 길드 화면에 노출시키지 않기 위한
 * 화이트리스트. 오픈채팅 공유 링크 형식: https://open.kakao.com/o/<code>
 */
const OPENCHAT_URL_RE = /^https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9]+$/;
const OPENCHAT_URL_MAX_LEN = 80;

/**
 * 길드 오픈채팅 링크 설정/해제 — 길드장·부길드장만. 빈 문자열이면 제거(null).
 * 인게임 채팅 미도입(GUILD §1.5) — 소통은 외부 오픈채팅으로(모더레이션 카카오 위임).
 */
export async function setGuildOpenchat(input: { userId: string; serverId: number; url: string }): Promise<void> {
  const url = input.url.trim();
  if (url.length > 0 && (url.length > OPENCHAT_URL_MAX_LEN || !OPENCHAT_URL_RE.test(url)))
    throw new GuildError('OPENCHAT_INVALID');
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
      .set({ openchatUrl: url.length > 0 ? url : null })
      .where(eq(guilds.id, m.guildId));
  });
}
