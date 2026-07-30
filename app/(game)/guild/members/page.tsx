import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuildMembersRich } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

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
  // 관리 동작(임명·위임·추방)이 이 화면으로 합쳐졌으므로(2026-07-30) 권한까지 함께 읽는다.
  // 종전엔 같은 명단이 /guild/settings 구성원 탭에도 있어 두 화면을 오가야 했다.
  const membership = await withTimeout(
    getGuildPermState(userId, serverId),
    DB_GUARD_MS,
    'guild.members.membership',
  );
  if (!membership) redirect('/guild');

  const members = await withTimeout(getGuildMembersRich(membership.guildId), DB_GUARD_MS, 'guild.members.list');

  return (
    <div className="px-4 py-4">
      <GuildMemberList
        members={members}
        myUserId={userId}
        serverId={serverId}
        myRole={membership.role}
        canKick={hasGuildPerm(membership.role, membership.permissions, 'kick')}
      />
    </div>
  );
}
