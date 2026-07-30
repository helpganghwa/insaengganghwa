import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import {
  getGuild,
  getJoinRequests,
  getGuildMembers,
  getGuildEmblems,
} from '@/lib/game/guild';

import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

import { GuildSettings } from './GuildSettings';

export const dynamic = 'force-dynamic';

export default async function GuildSettingsPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const perm = await getGuildPermState(userId, serverId);
  if (!perm) redirect('/guild');
  const membership = perm;
  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  if (!isOfficer) redirect('/guild');

  // 화면 게이팅은 역할이 아니라 **권한**(0142) — 길드장이 열어준 부길드장도 같은 화면을 쓴다.
  const can = {
    notice: hasGuildPerm(membership.role, membership.permissions, 'notice'),
    intro: hasGuildPerm(membership.role, membership.permissions, 'intro'),
    openchat: hasGuildPerm(membership.role, membership.permissions, 'openchat'),
    joinReview: hasGuildPerm(membership.role, membership.permissions, 'joinReview'),
    kick: hasGuildPerm(membership.role, membership.permissions, 'kick'),
    taxDistribute: hasGuildPerm(membership.role, membership.permissions, 'taxDistribute'),
    emblem: hasGuildPerm(membership.role, membership.permissions, 'emblem'),
  };

  // 가입 신청 목록은 joinReview 권한자에게만 — 권한 없는 부길드장의 클라 props에 신청자
  // 목록이 직렬화되지 않게 fetch 자체를 게이트(UI 숨김과 이중).
  const [guild, joinRequests, members, emblems] = await Promise.all([
    getGuild(membership.guildId),
    can.joinReview ? getJoinRequests(membership.guildId) : Promise.resolve([]),
    getGuildMembers(membership.guildId),
    can.emblem ? getGuildEmblems(membership.guildId) : Promise.resolve([]),
  ]);
  if (!guild) redirect('/guild');

  return (
    <GuildSettings
      myUserId={userId}
      myRole={membership.role}
      can={can}
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
