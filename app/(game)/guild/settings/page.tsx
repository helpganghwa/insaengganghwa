import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getMyMembership, getGuild, getJoinRequests, getGuildMembers } from '@/lib/game/guild';

import { GuildSettings } from './GuildSettings';

export const dynamic = 'force-dynamic';

export default async function GuildSettingsPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId);
  if (!membership) redirect('/guild');
  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  if (!isOfficer) redirect('/guild');

  const [guild, joinRequests, members] = await Promise.all([
    getGuild(membership.guildId),
    getJoinRequests(membership.guildId),
    getGuildMembers(membership.guildId),
  ]);
  if (!guild) redirect('/guild');

  return (
    <GuildSettings
      myUserId={userId}
      myRole={membership.role}
      guild={{
        taxPool: guild.taxPoolDiamond.toString(),
        joinPolicy: guild.joinPolicy === 'approval' ? 'approval' : 'open',
        emblemUrl: guild.emblemUrl,
        emblemColor: guild.emblemColor,
      }}
      joinRequests={joinRequests.map((r) => ({ userId: r.userId, nickname: r.nickname }))}
      members={members.map((m) => ({ userId: m.userId, nickname: m.nickname, role: m.role }))}
    />
  );
}
