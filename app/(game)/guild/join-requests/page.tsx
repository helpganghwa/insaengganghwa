import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuild, getJoinRequestsRich } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { guildCapacity } from '@/lib/game/guild/balance';

import { JoinRequestBoard } from './JoinRequestBoard';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/**
 * 가입 신청 — joinReview 권한자만(길드장 · 허용된 부길드장, 0142).
 * 종전엔 /guild/settings 구성원 탭 안 카드였고 행에 닉네임뿐이라 승인 판단 근거가 없었다.
 */
export default async function GuildJoinRequestsPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(
    getGuildPermState(userId, serverId),
    DB_GUARD_MS,
    'guild.joinRequests.membership',
  );
  if (!membership) redirect('/guild');
  if (!hasGuildPerm(membership.role, membership.permissions, 'joinReview')) redirect('/guild');

  const [guild, requests] = await Promise.all([
    withTimeout(getGuild(membership.guildId), DB_GUARD_MS, 'guild.joinRequests.guild'),
    withTimeout(
      getJoinRequestsRich(membership.guildId, serverId),
      DB_GUARD_MS,
      'guild.joinRequests.list',
    ),
  ]);
  if (!guild) redirect('/guild');

  return (
    <JoinRequestBoard
      guildName={guild.name}
      serverId={serverId}
      policy={guild.joinPolicy === 'approval' ? 'approval' : 'open'}
      memberCount={guild.memberCount}
      capacity={guildCapacity(guild.level)}
      requests={requests}
    />
  );
}
