import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getMyMembership, getGuildMembersRich } from '@/lib/game/guild';

import { GuildMemberList } from '../GuildMemberList';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/** 길드원 상세 — 홈 메뉴 '길드원' 타일 진입. 명단(아바타·장비·정렬). */
export default async function GuildMembersPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(getMyMembership(userId, serverId), DB_GUARD_MS, 'guild.members.membership');
  if (!membership) redirect('/guild');

  const members = await withTimeout(getGuildMembersRich(membership.guildId), DB_GUARD_MS, 'guild.members.list');

  return (
    <div className="px-4 py-4">
      <GuildMemberList members={members} myUserId={userId} serverId={serverId} />
    </div>
  );
}
