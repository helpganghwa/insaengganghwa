import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import {
  getMyMembership,
  getGuild,
  getJoinRequests,
  getGuildMembers,
  getGuildEmblems,
} from '@/lib/game/guild';

import { GuildSettings } from './GuildSettings';

export const dynamic = 'force-dynamic';

export default async function GuildSettingsPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId, serverId);
  if (!membership) redirect('/guild');
  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  if (!isOfficer) redirect('/guild');

  // 가입 신청 목록은 길드장 전용(2026-07-10 권한 조정) — 부길드장 클라 props에 신청자
  // 목록이 직렬화되지 않게 fetch 자체를 게이트(UI 숨김과 이중).
  const [guild, joinRequests, members, emblems] = await Promise.all([
    getGuild(membership.guildId),
    membership.role === 'leader' ? getJoinRequests(membership.guildId) : Promise.resolve([]),
    getGuildMembers(membership.guildId),
    getGuildEmblems(membership.guildId),
  ]);
  if (!guild) redirect('/guild');

  return (
    <GuildSettings
      myUserId={userId}
      myRole={membership.role}
      guild={{
        name: guild.name,
        taxPool: guild.taxPoolDiamond.toString(),
        joinPolicy: guild.joinPolicy === 'approval' ? 'approval' : 'open',
        notice: guild.notice ?? '',
        intro: guild.intro ?? '',
        openchatUrl: guild.openchatUrl ?? '',
        emblemUrl: guild.emblemUrl,
        emblemColor: guild.emblemColor,
      }}
      emblems={emblems}
      joinRequests={joinRequests.map((r) => ({ userId: r.userId, nickname: r.nickname }))}
      members={members.map((m) => ({ userId: m.userId, nickname: m.nickname, role: m.role }))}
    />
  );
}
