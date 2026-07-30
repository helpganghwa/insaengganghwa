import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { getGuild, getGuildMembers } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

import { BackBar } from '@/components/BackNav';

import { DistributeBoard } from './DistributeBoard';

export const dynamic = 'force-dynamic';

export default async function DistributePage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getGuildPermState(userId, serverId);
  if (!membership) redirect('/guild');
  // 분배는 taxDistribute 권한자(길드장 · 허용된 부길드장, 0142) — 종전 길드장 전속에서 완화.
  if (!hasGuildPerm(membership.role, membership.permissions, 'taxDistribute')) {
    redirect('/guild/settings');
  }

  const [guild, members] = await Promise.all([
    getGuild(membership.guildId),
    getGuildMembers(membership.guildId),
  ]);
  if (!guild) redirect('/guild');

  return (
    <div className="px-4 py-4">
      <BackBar title={`${guild.name} · 세금 분배`} />
      <DistributeBoard
        myUserId={userId}
        pool={guild.taxPoolDiamond.toString()}
        members={members.map((m) => ({ userId: m.userId, nickname: m.nickname, role: m.role }))}
      />
    </div>
  );
}
