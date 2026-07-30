import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuild, getGuildEmblems } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

import { EmblemBoard } from './EmblemBoard';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/** 길드 문양 — emblem 권한자만(길드장 · 허용된 부길드장, 0142). 생성마다 다이아가 소모된다. */
export default async function GuildEmblemPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const m = await withTimeout(getGuildPermState(userId, serverId), DB_GUARD_MS, 'guild.emblem.membership');
  if (!m) redirect('/guild');
  if (!hasGuildPerm(m.role, m.permissions, 'emblem')) redirect('/guild');

  const [guild, emblems] = await Promise.all([
    withTimeout(getGuild(m.guildId), DB_GUARD_MS, 'guild.emblem.guild'),
    withTimeout(getGuildEmblems(m.guildId), DB_GUARD_MS, 'guild.emblem.list'),
  ]);
  if (!guild) redirect('/guild');

  return <EmblemBoard guildName={guild.name} emblems={emblems} />;
}
