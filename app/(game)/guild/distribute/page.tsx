import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getMyMembership, getGuild, getGuildMembers } from '@/lib/game/guild';

import { DistributeBoard } from './DistributeBoard';

export const dynamic = 'force-dynamic';

export default async function DistributePage() {
  const userId = await getSessionUserId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId);
  if (!membership) redirect('/guild');
  if (membership.role !== 'leader') redirect('/guild/settings'); // 분배는 길드장만

  const [guild, members] = await Promise.all([
    getGuild(membership.guildId),
    getGuildMembers(membership.guildId),
  ]);
  if (!guild) redirect('/guild');

  return (
    <DistributeBoard
      myUserId={userId}
      pool={guild.taxPoolDiamond.toString()}
      members={members.map((m) => ({ userId: m.userId, nickname: m.nickname, role: m.role }))}
    />
  );
}
